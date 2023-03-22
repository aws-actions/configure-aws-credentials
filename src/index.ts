import * as core from '@actions/core';
import { assumeRole } from './assumeRole';
import { CredentialsClient } from './CredentialsClient';
import { errorMessage, retryAndBackoff, exportRegion, exportCredentials, exportAccountId } from './helpers';

const DEFAULT_ROLE_DURATION = 3600; // One hour (seconds)
const ROLE_SESSION_NAME = 'GitHubActions';
const REGION_REGEX = /^[a-z0-9-]+$/g;

export async function run() {
  try {
    // Get inputs
    const AccessKeyId = core.getInput('aws-access-key-id', { required: false });
    const SecretAccessKey = core.getInput('aws-secret-access-key', { required: false });
    const sessionTokenInput = core.getInput('aws-session-token', { required: false });
    const SessionToken = sessionTokenInput === '' ? undefined : sessionTokenInput;
    const region =
      core.getInput('aws-region', { required: false }) ||
      process.env['AWS_REGION'] ||
      process.env['AWS_DEFAULT_REGION'];
    const roleToAssume = core.getInput('role-to-assume', { required: false });
    const audience = core.getInput('audience', { required: false });
    const maskAccountId = core.getInput('mask-aws-account-id', { required: false });
    const roleExternalId = core.getInput('role-external-id', { required: false });
    const webIdentityTokenFile = core.getInput('web-identity-token-file', { required: false });
    const roleDuration = parseInt(core.getInput('role-duration-seconds', { required: false })) || DEFAULT_ROLE_DURATION;
    const roleSessionName = core.getInput('role-session-name', { required: false }) || ROLE_SESSION_NAME;
    const roleSkipSessionTaggingInput = core.getInput('role-skip-session-tagging', { required: false }) || 'false';
    const roleSkipSessionTagging = roleSkipSessionTaggingInput.toLowerCase() === 'true';
    const proxyServer = core.getInput('http-proxy', { required: false });
    const disableOIDC = core.getInput('disable-oidc', { required: false });

    // Logic to decide whether to attempt to use OIDC or not
    const useGitHubOIDCProvider = () => {
      // The `ACTIONS_ID_TOKEN_REQUEST_TOKEN` environment variable is set when the `id-token` permission is granted.
      // This is necessary to authenticate with OIDC, but not strictly set just for OIDC. If it is not set and all other
      // checks pass, it is likely but not guaranteed that the user needs but lacks this permission in their workflow.
      // So, we will log a warning when it is the only piece absent, as well as add an opportunity to manually disable the entire check.
      if (
        !!roleToAssume &&
        !webIdentityTokenFile &&
        !AccessKeyId &&
        !disableOIDC &&
        !process.env['ACTIONS_ID_TOKEN_REQUEST_TOKEN']
      ) {
        core.info(
          'It looks like you might be trying to authenticate with OIDC. Did you mean to set the `id-token` permission?'
        );
      }
      return (
        !!roleToAssume &&
        !!process.env['ACTIONS_ID_TOKEN_REQUEST_TOKEN'] &&
        !AccessKeyId &&
        !webIdentityTokenFile &&
        !disableOIDC
      );
    };

    // Validate and export region
    if (region) {
      core.info('Using global STS endpoint');
      if (!region.match(REGION_REGEX)) {
        throw new Error(`Region is not valid: ${region}`);
      }
      exportRegion(region);
    }

    // Instantiate credentials client
    const credentialsClient = new CredentialsClient({ region, proxyServer });

    // Always export the source credentials and account ID.
    // The STS client for calling AssumeRole pulls creds from the environment.
    // Plus, in the assume role case, if the AssumeRole call fails, we want
    // the source credentials and account ID to already be masked as secrets
    // in any error messages.
    if (AccessKeyId) {
      if (!SecretAccessKey) {
        throw new Error("'aws-secret-access-key' must be provided if 'aws-access-key-id' is provided");
      }
      exportCredentials({ AccessKeyId, SecretAccessKey, SessionToken });
    }

    // If OIDC is being used, generate token
    // Else, validate that the SDK can pick up credentials
    let sourceAccountId: string;
    let webIdentityToken: string;
    if (useGitHubOIDCProvider()) {
      webIdentityToken = await core.getIDToken(audience);
      // Implement #359
    } else {
      // Regardless of whether any source credentials were provided as inputs,
      // validate that the SDK can actually pick up credentials.  This validates
      // cases where this action is on a self-hosted runner that doesn't have credentials
      // configured correctly, and cases where the user intended to provide input
      // credentials but the secrets inputs resolved to empty strings.
      await credentialsClient.validateCredentials(AccessKeyId);

      sourceAccountId = await exportAccountId(credentialsClient, maskAccountId);
    }

    // Get role credentials if configured to do so
    if (roleToAssume) {
      const roleCredentials = await retryAndBackoff(async () => {
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
        });
      }, true);
      core.info(`Authenticated as assumedRoleId ${roleCredentials.AssumedRoleUser!.AssumedRoleId!}`);
      exportCredentials(roleCredentials.Credentials);
      // We need to validate the credentials in 2 of our use-cases
      // First: self-hosted runners. If the GITHUB_ACTIONS environment variable
      //  is set to `true` then we are NOT in a self-hosted runner.
      // Second: Customer provided credentials manually (IAM User keys stored in GH Secrets)
      if (!process.env['GITHUB_ACTIONS'] || AccessKeyId) {
        await credentialsClient.validateCredentials(roleCredentials.Credentials?.AccessKeyId);
      }
      await exportAccountId(credentialsClient, maskAccountId);
      // implement #432
    } else {
      // implement #370
      core.info('Proceeding with IAM user credentials');
    }
  } catch (error) {
    core.setFailed(errorMessage(error));

    const showStackTrace = process.env['SHOW_STACK_TRACE'];

    if (showStackTrace === 'true') {
      throw error;
    }
  }
}

/* c8 ignore start */
if (require.main === module) {
  (async () => {
    await run();
  })().catch((error) => {
    core.setFailed(errorMessage(error));
  });
}
