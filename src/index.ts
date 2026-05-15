import * as core from '@actions/core';
import type { AssumeRoleCommandOutput } from '@aws-sdk/client-sts';
import { assumeRole } from './assumeRole';
import { CredentialsClient } from './CredentialsClient';
import {
  areCredentialsValid,
  errorMessage,
  exportAccountId,
  exportCredentials,
  exportRegion,
  getBooleanInput,
  retryAndBackoff,
  translateEnvVariables,
  unsetCredentials,
  verifyKeys,
} from './helpers';
import { writeProfileFiles } from './profileManager';

const DEFAULT_ROLE_DURATION = 3600; // One hour (seconds)
const ROLE_SESSION_NAME = 'GitHubActions';
const REGION_REGEX = /^[a-z0-9-]+$/g;
const ROLE_SESSION_NAME_REGEX = /^[\w+=,.@-]*$/;

export async function run() {
  try {
    translateEnvVariables();
    // Get inputs
    // Undefined inputs are empty strings ( or empty arrays)
    const AccessKeyId = core.getInput('aws-access-key-id', { required: false });
    const SecretAccessKey = core.getInput('aws-secret-access-key', { required: false });
    const sessionTokenInput = core.getInput('aws-session-token', { required: false });
    const SessionToken = sessionTokenInput === '' ? undefined : sessionTokenInput;
    const region = core.getInput('aws-region', { required: true });
    const awsProfile = core.getInput('aws-profile', { required: false });
    const overwriteAwsProfile = getBooleanInput('overwrite-aws-profile', { required: false });
    const roleToAssume = core.getInput('role-to-assume', { required: false });
    const audience = core.getInput('audience', { required: false });
    const maskAccountId = getBooleanInput('mask-aws-account-id', { required: false });
    const roleExternalId = core.getInput('role-external-id', { required: false });
    const webIdentityTokenFile = core.getInput('web-identity-token-file', { required: false });
    const roleDuration =
      Number.parseInt(core.getInput('role-duration-seconds', { required: false })) || DEFAULT_ROLE_DURATION;
    const roleSessionName = core.getInput('role-session-name', { required: false }) || ROLE_SESSION_NAME;
    const roleSkipSessionTagging = getBooleanInput('role-skip-session-tagging', { required: false });
    const transitiveTagKeys = core.getMultilineInput('transitive-tag-keys', { required: false });
    const proxyServer = core.getInput('http-proxy', { required: false }) || process.env.HTTP_PROXY;
    const customTags = core.getInput('custom-tags', { required: false });
    const inlineSessionPolicy = core.getInput('inline-session-policy', { required: false });
    const managedSessionPolicies = core.getMultilineInput('managed-session-policies', { required: false }).map((p) => {
      return { arn: p };
    });
    const roleChaining = getBooleanInput('role-chaining', { required: false });
    const outputCredentials = getBooleanInput('output-credentials', { required: false });
    // Default to always outputting environment credentials unless profile is specified. If profile is specified, default to
    // no environment credentials (but still output them if the user specifically requests it).
    const outputEnvCredentials = getBooleanInput('output-env-credentials', { required: false, default: !awsProfile });
    const unsetCurrentCredentials = getBooleanInput('unset-current-credentials', { required: false });
    let disableRetry = getBooleanInput('disable-retry', { required: false });
    const specialCharacterWorkaround = getBooleanInput('special-characters-workaround', { required: false });
    const useExistingCredentials = core.getInput('use-existing-credentials', { required: false });
    let maxRetries = Number.parseInt(core.getInput('retry-max-attempts', { required: false })) || 12;
    const expectedAccountIds = core
      .getInput('allowed-account-ids', { required: false })
      .split(',')
      .map((s) => s.trim());
    const forceSkipOidc = getBooleanInput('force-skip-oidc', { required: false });
    const noProxy = core.getInput('no-proxy', { required: false });
    const stsEndpoint = core.getInput('sts-endpoint', { required: false });
    const globalTimeout = Number.parseInt(core.getInput('action-timeout-s', { required: false })) || 0;

    let timeoutId: NodeJS.Timeout | undefined;
    if (globalTimeout > 0) {
      core.info(`Setting a global timeout of ${globalTimeout} seconds for the action`);
      timeoutId = setTimeout(() => {
        core.setFailed(`Action timed out after ${globalTimeout} seconds`);
        process.exit(1);
      }, globalTimeout * 1000);
    }

    // Container-sourced credentials are exposed by the AWS SDK default chain via these env vars. They count as a valid
    // non-OIDC source for the force-skip-oidc guard.
    const hasContainerCredentials = !!(
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI
    );

    if (forceSkipOidc && roleToAssume && !AccessKeyId && !webIdentityTokenFile && !hasContainerCredentials) {
      throw new Error(
        "If 'force-skip-oidc' is true and 'role-to-assume' is set, 'aws-access-key-id', 'web-identity-token-file', or container credentials must be available",
      );
    }

    if (forceSkipOidc && hasContainerCredentials && !AccessKeyId && !webIdentityTokenFile) {
      core.info('Using container credentials from AWS_CONTAINER_CREDENTIALS_* environment variables');
    }

    if (specialCharacterWorkaround) {
      // 😳
      disableRetry = false;
      maxRetries = 12;
    } else if (maxRetries < 1) {
      maxRetries = 1;
    }

    const withRetry = <T>(fn: () => Promise<T>, label: string): Promise<T> =>
      retryAndBackoff(fn, !disableRetry, maxRetries, 0, 50, label);

    // Logic to decide whether to attempt to use OIDC or not
    const useGitHubOIDCProvider = () => {
      if (forceSkipOidc) return false;
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
      unsetCredentials(outputEnvCredentials);
    }

    if (!region.match(REGION_REGEX)) {
      throw new Error(`Region is not valid: ${region}`);
    }

    if (roleSessionName.length < 2 || roleSessionName.length > 64) {
      throw new Error(
        `Role session name must be between 2 and 64 characters, got ${roleSessionName.length}: '${roleSessionName}'`,
      );
    }
    if (!roleSessionName.match(ROLE_SESSION_NAME_REGEX)) {
      throw new Error(
        `Role session name is not valid: '${roleSessionName}'. Must satisfy regular expression pattern: [\\w+=,.@-]*`,
      );
    }

    exportRegion(region, outputEnvCredentials);

    // Instantiate credentials client
    const clientProps: {
      region: string;
      proxyServer?: string;
      noProxy?: string;
      stsEndpoint?: string;
      roleChaining: boolean;
    } = {
      region,
      roleChaining,
    };
    if (proxyServer) clientProps.proxyServer = proxyServer;
    if (noProxy) clientProps.noProxy = noProxy;
    if (stsEndpoint) clientProps.stsEndpoint = stsEndpoint;
    const credentialsClient = new CredentialsClient(clientProps);
    let sourceAccountId: string;
    let webIdentityToken: string;

    //if the user wants to attempt to use existing credentials, check if we have some already
    if (useExistingCredentials) {
      const validCredentials = await areCredentialsValid(credentialsClient);
      if (validCredentials) {
        core.notice('Pre-existing credentials are valid. No need to generate new ones.');
        if (timeoutId) clearTimeout(timeoutId);
        return;
      }
      core.notice('No valid credentials exist. Running as normal.');
    }

    // If OIDC is being used, generate token
    // Else, export credentials provided as input
    if (useGitHubOIDCProvider()) {
      try {
        webIdentityToken = await withRetry(async () => {
          return core.getIDToken(audience);
        }, 'getIDToken');
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
      exportCredentials({ AccessKeyId, SecretAccessKey, SessionToken }, outputCredentials, outputEnvCredentials);

      // If using IAM User Credentials, write to profile now so that the assumeRole call can succeed (and also for
      // credential validation before role assumption).
      if (awsProfile) {
        writeProfileFiles(awsProfile, { AccessKeyId, SecretAccessKey, SessionToken }, region, overwriteAwsProfile);
      }
    } else if (!webIdentityTokenFile && !roleChaining) {
      // Proceed only if credentials can be picked up
      await withRetry(
        () => credentialsClient.validateCredentials(undefined, roleChaining, expectedAccountIds),
        'validateCredentials',
      );
      sourceAccountId = await withRetry(() => exportAccountId(credentialsClient, maskAccountId), 'exportAccountId');
    }

    if (AccessKeyId || roleChaining) {
      // Validate that the SDK can actually pick up credentials.
      // This validates cases where this action is using existing environment credentials,
      // and cases where the user intended to provide input credentials but the secrets inputs resolved to empty strings.
      // Skip when output-env-credentials is false: input IAM keys were not written to env, so
      // the default chain would resolve to ambient runner credentials and the access-key check
      // would spuriously fail (see #1554).
      if (outputEnvCredentials) {
        await withRetry(
          () => credentialsClient.validateCredentials(AccessKeyId, roleChaining, expectedAccountIds),
          'validateCredentials',
        );
        sourceAccountId = await withRetry(() => exportAccountId(credentialsClient, maskAccountId), 'exportAccountId');
      }
    }
    if (customTags && (useGitHubOIDCProvider() || webIdentityTokenFile)) {
      core.warning(
        "'custom-tags' is set but will be ignored because session tags cannot be applied when using OIDC or web identity token authentication. " +
          'Tags are controlled by the identity provider token claims in these authentication flows.',
      );
    }

    // Get role credentials if configured to do so
    if (roleToAssume) {
      let roleCredentials: AssumeRoleCommandOutput;
      do {
        roleCredentials = await withRetry(async () => {
          return assumeRole({
            credentialsClient,
            sourceAccountId,
            roleToAssume,
            roleExternalId,
            roleDuration,
            roleSessionName,
            roleSkipSessionTagging,
            transitiveTagKeys,
            webIdentityTokenFile,
            webIdentityToken,
            inlineSessionPolicy,
            managedSessionPolicies,
            customTags,
          });
        }, 'AssumeRole');
      } while (specialCharacterWorkaround && !verifyKeys(roleCredentials.Credentials));
      core.info(`Authenticated as assumedRoleId ${roleCredentials.AssumedRoleUser?.AssumedRoleId}`);
      exportCredentials(roleCredentials.Credentials, outputCredentials, outputEnvCredentials);
      // Validate that the SDK can pick up the assumed-role credentials from the environment.
      // Skip when output-env-credentials is false: the credentials were never written to env,
      // so the default credential provider chain would resolve to ambient runner credentials
      // (e.g. an EC2 instance profile) and the access-key-id check would spuriously fail.
      // Skip when using a profile: validation runs after the profile file is written below.
      if ((!process.env.GITHUB_ACTIONS || AccessKeyId) && !awsProfile && outputEnvCredentials) {
        await withRetry(
          () =>
            credentialsClient.validateCredentials(
              roleCredentials.Credentials?.AccessKeyId,
              roleChaining,
              expectedAccountIds,
            ),
          'validateCredentials',
        );
      }
      if (outputEnvCredentials) {
        await withRetry(() => exportAccountId(credentialsClient, maskAccountId), 'exportAccountId');
      }

      // Write profile files if profile mode is enabled
      if (awsProfile) {
        if (!roleCredentials.Credentials) {
          throw new Error('AssumeRole call succeeded but returned no credentials');
        }
        // If user provided IAM User Credentials and then we assumed a role, overwrite the profile file to add
        // the session token. (this only overwrites the profile within a single run of the action).
        // We then validate the credentials to make sure they work.
        if (AccessKeyId || !process.env.GITHUB_ACTIONS) {
          writeProfileFiles(awsProfile, roleCredentials.Credentials, region, true);
          await withRetry(
            () =>
              credentialsClient.validateCredentials(
                roleCredentials.Credentials?.AccessKeyId,
                roleChaining,
                expectedAccountIds,
              ),
            'validateCredentials',
          );
        } else {
          writeProfileFiles(awsProfile, roleCredentials.Credentials, region, overwriteAwsProfile);
        }

        if (outputEnvCredentials) {
          core.exportVariable('AWS_PROFILE', awsProfile);
        }
      }
    } else {
      core.info('Proceeding with IAM user credentials');

      if (awsProfile) {
        if (outputEnvCredentials) {
          core.exportVariable('AWS_PROFILE', awsProfile);
        }
      }
    }

    // Clear timeout on successful completion
    if (timeoutId) clearTimeout(timeoutId);
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
