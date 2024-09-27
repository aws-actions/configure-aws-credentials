import * as core from '@actions/core';
import type { AssumeRoleCommandOutput } from '@aws-sdk/client-sts';
import { CredentialsClient } from './CredentialsClient';
import { assumeRole } from './assumeRole';
import {
  errorMessage,
  exportAccountId,
  exportCredentials,
  exportRegion,
  retryAndBackoff,
  unsetCredentials,
  verifyKeys,
} from './helpers';

const DEFAULT_ROLE_DURATION = 3600; // One hour (seconds)
const ROLE_SESSION_NAME = 'GitHubActions';
const REGION_REGEX = /^[a-z0-9-]+$/g;

export async function run() {
  try {
    // Get inputs
    const AccessKeyId = core.getInput('aws-access-key-id', { required: false });
    const SecretAccessKey = core.getInput('aws-secret-access-key', {
      required: false,
    });
    const sessionTokenInput = core.getInput('aws-session-token', {
      required: false,
    });
    const SessionToken = sessionTokenInput === '' ? undefined : sessionTokenInput;
    const region = core.getInput('aws-region', { required: true });
    const roleToAssume = core.getInput('role-to-assume', { required: false });
    const audience = core.getInput('audience', { required: false });
    const maskAccountIdInput = core.getInput('mask-aws-account-id', { required: false }) || 'false';
    const maskAccountId = maskAccountIdInput.toLowerCase() === 'true';
    const roleExternalId = core.getInput('role-external-id', {
      required: false,
    });
    const webIdentityTokenFile = core.getInput('web-identity-token-file', {
      required: false,
    });
    const roleDuration =
      Number.parseInt(core.getInput('role-duration-seconds', { required: false })) || DEFAULT_ROLE_DURATION;
    const roleSessionName = core.getInput('role-session-name', { required: false }) || ROLE_SESSION_NAME;
    const roleSkipSessionTaggingInput = core.getInput('role-skip-session-tagging', { required: false }) || 'false';
    const roleSkipSessionTagging = roleSkipSessionTaggingInput.toLowerCase() === 'true';
    const proxyServer = core.getInput('http-proxy', { required: false });
    const inlineSessionPolicy = core.getInput('inline-session-policy', {
      required: false,
    });
    const managedSessionPoliciesInput = core.getMultilineInput('managed-session-policies', { required: false });
    const managedSessionPolicies: { arn: string }[] = [];
    const roleChainingInput = core.getInput('role-chaining', { required: false }) || 'false';
    const roleChaining = roleChainingInput.toLowerCase() === 'true';
    const outputCredentialsInput = core.getInput('output-credentials', { required: false }) || 'false';
    const outputCredentials = outputCredentialsInput.toLowerCase() === 'true';
    const unsetCurrentCredentialsInput = core.getInput('unset-current-credentials', { required: false }) || 'false';
    const unsetCurrentCredentials = unsetCurrentCredentialsInput.toLowerCase() === 'true';
    const disableRetryInput = core.getInput('disable-retry', { required: false }) || 'false';
    let disableRetry = disableRetryInput.toLowerCase() === 'true';
    const specialCharacterWorkaroundInput =
      core.getInput('special-characters-workaround', { required: false }) || 'false';
    const specialCharacterWorkaround = specialCharacterWorkaroundInput.toLowerCase() === 'true';
    let maxRetries = Number.parseInt(core.getInput('retry-max-attempts', { required: false })) || 12;
    switch (true) {
      case specialCharacterWorkaround:
        // 😳
        disableRetry = false;
        maxRetries = 12;
        break;
      case maxRetries < 1:
        maxRetries = 1;
        break;
    }
    for (const managedSessionPolicy of managedSessionPoliciesInput) {
      managedSessionPolicies.push({ arn: managedSessionPolicy });
    }

    // Logic to decide whether to attempt to use OIDC or not
    const useGitHubOIDCProvider = () => {
      // The `ACTIONS_ID_TOKEN_REQUEST_TOKEN` environment variable is set when the `id-token` permission is granted.
      // This is necessary to authenticate with OIDC, but not strictly set just for OIDC. If it is not set and all other
      // checks pass, it is likely but not guaranteed that the user needs but lacks this permission in their workflow.
      // So, we will log a warning when it is the only piece absent
      if (
        !!roleToAssume &&
        !webIdentityTokenFile &&
        !AccessKeyId &&
        !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN &&
        !roleChaining
      ) {
        core.info(
          'It looks like you might be trying to authenticate with OIDC. Did you mean to set the `id-token` permission? ' +
            'If you are not trying to authenticate with OIDC and the action is working successfully, you can ignore this message.',
        );
      }
      return (
        !!roleToAssume &&
        !!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN &&
        !AccessKeyId &&
        !webIdentityTokenFile &&
        !roleChaining
      );
    };

    if (unsetCurrentCredentials) {
      unsetCredentials();
    }

    if (!region.match(REGION_REGEX)) {
      throw new Error(`Region is not valid: ${region}`);
    }
    exportRegion(region);

    // Instantiate credentials client
    const credentialsClient = new CredentialsClient({ region, proxyServer });
    let sourceAccountId: string;
    let webIdentityToken: string;

    // If OIDC is being used, generate token
    // Else, export credentials provided as input
    if (useGitHubOIDCProvider()) {
      try {
        webIdentityToken = await retryAndBackoff(
          async () => {
            return core.getIDToken(audience);
          },
          !disableRetry,
          maxRetries,
        );
      } catch (error) {
        throw new Error(`getIDToken call failed: ${errorMessage(error)}`);
      }
    } else if (AccessKeyId) {
      if (!SecretAccessKey) {
        throw new Error("'aws-secret-access-key' must be provided if 'aws-access-key-id' is provided");
      }
      // The STS client for calling AssumeRole pulls creds from the environment.
      // Plus, in the assume role case, if the AssumeRole call fails, we want
      // the source credentials to already be masked as secrets
      // in any error messages.
      exportCredentials({ AccessKeyId, SecretAccessKey, SessionToken });
    } else if (!webIdentityTokenFile && !roleChaining) {
      // Proceed only if credentials can be picked up
      await credentialsClient.validateCredentials();
      sourceAccountId = await exportAccountId(credentialsClient, maskAccountId);
    }

    if (AccessKeyId || roleChaining) {
      // Validate that the SDK can actually pick up credentials.
      // This validates cases where this action is using existing environment credentials,
      // and cases where the user intended to provide input credentials but the secrets inputs resolved to empty strings.
      await credentialsClient.validateCredentials(AccessKeyId, roleChaining);
      sourceAccountId = await exportAccountId(credentialsClient, maskAccountId);
    }

    // Get role credentials if configured to do so
    if (roleToAssume) {
      let roleCredentials: AssumeRoleCommandOutput;
      do {
        roleCredentials = await retryAndBackoff(
          async () => {
            return assumeRole({
              credentialsClient,
              sourceAccountId,
              roleToAssume,
              roleExternalId,
              roleDuration,
              roleSessionName,
              roleSkipSessionTagging,
              webIdentityTokenFile,
              webIdentityToken,
              inlineSessionPolicy,
              managedSessionPolicies,
            });
          },
          !disableRetry,
          maxRetries,
        );
      } while (specialCharacterWorkaround && !verifyKeys(roleCredentials.Credentials));
      core.info(`Authenticated as assumedRoleId ${roleCredentials.AssumedRoleUser?.AssumedRoleId}`);
      exportCredentials(roleCredentials.Credentials, outputCredentials);
      // We need to validate the credentials in 2 of our use-cases
      // First: self-hosted runners. If the GITHUB_ACTIONS environment variable
      //  is set to `true` then we are NOT in a self-hosted runner.
      // Second: Customer provided credentials manually (IAM User keys stored in GH Secrets)
      if (!process.env.GITHUB_ACTIONS || AccessKeyId) {
        await credentialsClient.validateCredentials(roleCredentials.Credentials?.AccessKeyId);
      }
      await exportAccountId(credentialsClient, maskAccountId);
    } else {
      core.info('Proceeding with IAM user credentials');
    }
  } catch (error) {
    core.setFailed(errorMessage(error));

    const showStackTrace = process.env.SHOW_STACK_TRACE;

    if (showStackTrace === 'true') {
      throw error;
    }
  }
}

/* c8 ignore start */
/* istanbul ignore next */
if (require.main === module) {
  (async () => {
    await run();
  })().catch((error) => {
    core.setFailed(errorMessage(error));
  });
}
