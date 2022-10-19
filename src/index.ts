import * as core from '@actions/core';
import { Credentials, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { assumeRole } from './assumeRole';
import { errorMessage, getStsClient, retryAndBackoff } from './helpers';

// Use 1hr as role duration when using session token or OIDC
// Otherwise, use the max duration of GitHub action (6hr)
const MAX_ACTION_RUNTIME = 6 * 3600;
const SESSION_ROLE_DURATION = 3600;
const DEFAULT_ROLE_DURATION_FOR_OIDC_ROLES = 3600;
const USER_AGENT = 'configure-aws-credentials-for-github-actions';
const ROLE_SESSION_NAME = 'GitHubActions';
const REGION_REGEX = /^[a-z0-9-]+$/g;

function exportCredentials(creds?: Partial<Credentials>) {
  // Configure the AWS CLI and AWS SDKs using environment variables and set them as secrets.
  // Setting the credentials as secrets masks them in Github Actions logs

  // AWS_ACCESS_KEY_ID:
  // Specifies an AWS access key associated with an IAM user or role
  if (creds?.AccessKeyId) {
    core.setSecret(creds.AccessKeyId);
    core.exportVariable('AWS_ACCESS_KEY_ID', creds.AccessKeyId);
  }

  // AWS_SECRET_ACCESS_KEY:
  // Specifies the secret key associated with the access key. This is essentially the "password" for the access key.
  if (creds?.SecretAccessKey) {
    core.setSecret(creds.SecretAccessKey);
    core.exportVariable('AWS_SECRET_ACCESS_KEY', creds.SecretAccessKey);
  }

  // AWS_SESSION_TOKEN:
  // Specifies the session token value that is required if you are using temporary security credentials.
  if (creds?.SessionToken) {
    core.setSecret(creds.SessionToken);
    core.exportVariable('AWS_SESSION_TOKEN', creds.SessionToken);
  } else if (process.env.AWS_SESSION_TOKEN) {
    // clear session token from previous credentials action
    core.exportVariable('AWS_SESSION_TOKEN', '');
  }
}

function exportRegion(region: string) {
  // AWS_DEFAULT_REGION and AWS_REGION:
  // Specifies the AWS Region to send requests to
  core.exportVariable('AWS_DEFAULT_REGION', region);
  core.exportVariable('AWS_REGION', region);
}

async function exportAccountId(region: string, maskAccountId?: boolean) {
  // Get the AWS account ID
  const client = getStsClient(region, USER_AGENT);
  const identity = await client.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account;
  if (!accountId) {
    throw new Error('Could not get Account ID from STS. Did you set credentials?');
  }
  if (maskAccountId) {
    core.setSecret(accountId);
  }
  core.setOutput('aws-account-id', accountId);
  return accountId;
}

async function loadCredentials() {
  // Previously, this function forced the SDK to re-resolve credentials with the default provider chain.
  //
  // This action typically sets credentials in the environment via environment variables. The SDK never refreshed those
  // env-var-based credentials after initial load. In case there were already env-var creds set in the actions
  // environment when this action loaded, this action needed to refresh the SDK creds after overwriting those
  // environment variables.
  //
  // However, in V3 of the JavaScript SDK, there is no longer a global configuration object: all configuration,
  // including credentials, are instantiated per client and not merged back into global state.

  const client = new STSClient({});
  return client.config.credentials();
}

async function validateCredentials(expectedAccessKeyId?: string) {
  let credentials;
  try {
    credentials = await loadCredentials();
    if (!credentials.accessKeyId) {
      throw new Error('Access key ID empty after loading credentials');
    }
  } catch (error) {
    throw new Error(`Credentials could not be loaded, please check your action inputs: ${errorMessage(error)}`);
  }

  const actualAccessKeyId = credentials.accessKeyId;

  if (expectedAccessKeyId && expectedAccessKeyId !== actualAccessKeyId) {
    throw new Error(
      'Unexpected failure: Credentials loaded by the SDK do not match the access key ID configured by the action'
    );
  }
}
export async function run() {
  try {
    // Get inputs
    const AccessKeyId = core.getInput('aws-access-key-id', { required: false });
    const audience = core.getInput('audience', { required: false });
    const SecretAccessKey = core.getInput('aws-secret-access-key', { required: false });
    const region = core.getInput('aws-region', { required: true });
    const SessionToken = core.getInput('aws-session-token', { required: false });
    const maskAccountId =
      (core.getInput('mask-aws-account-id', { required: false }) || 'true').toLowerCase() === 'true';
    const roleToAssume = core.getInput('role-to-assume', { required: false });
    const roleExternalId = core.getInput('role-external-id', { required: false });
    const webIdentityTokenFile = core.getInput('web-identity-token-file', { required: false });
    // This wraps the logic for deciding if we should rely on the GH OIDC provider since we may need to reference
    // the decision in a few differennt places. Consolidating it here makes the logic clearer elsewhere.
    const useGitHubOIDCProvider =
      !!roleToAssume && !!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN && !AccessKeyId && !webIdentityTokenFile;
    const roleDurationSeconds =
      parseInt(core.getInput('role-duration-seconds', { required: false })) ||
      (SessionToken && SESSION_ROLE_DURATION) ||
      (useGitHubOIDCProvider && DEFAULT_ROLE_DURATION_FOR_OIDC_ROLES) ||
      MAX_ACTION_RUNTIME;
    const roleSessionName = core.getInput('role-session-name', { required: false }) || ROLE_SESSION_NAME;
    const roleSkipSessionTaggingInput = core.getInput('role-skip-session-tagging', { required: false }) || 'false';
    const roleSkipSessionTagging = roleSkipSessionTaggingInput.toLowerCase() === 'true';

    if (!region.match(REGION_REGEX)) {
      throw new Error(`Region is not valid: ${region}`);
    }

    exportRegion(region);

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

    // Attempt to load credentials from the GitHub OIDC provider.
    // If a user provides an IAM Role Arn and DOESN'T provide an Access Key Id
    // The only way to assume the role is via GitHub's OIDC provider.
    let sourceAccountId: string;
    let webIdentityToken: string;
    if (useGitHubOIDCProvider) {
      webIdentityToken = await core.getIDToken(audience);
      // We don't validate the credentials here because we don't have them yet when using OIDC.
    } else {
      // Regardless of whether any source credentials were provided as inputs,
      // validate that the SDK can actually pick up credentials.  This validates
      // cases where this action is on a self-hosted runner that doesn't have credentials
      // configured correctly, and cases where the user intended to provide input
      // credentials but the secrets inputs resolved to empty strings.
      await validateCredentials(AccessKeyId);

      sourceAccountId = await exportAccountId(region, maskAccountId);
    }

    // Get role credentials if configured to do so
    if (roleToAssume) {
      const roleCredentials = await retryAndBackoff(async () => {
        return assumeRole({
          sourceAccountId,
          region,
          roleToAssume,
          roleExternalId,
          roleDurationSeconds,
          roleSessionName,
          roleSkipSessionTagging,
          webIdentityTokenFile,
          webIdentityToken,
        });
      }, true);
      exportCredentials(roleCredentials.Credentials);
      // We need to validate the credentials in 2 of our use-cases
      // First: self-hosted runners. If the GITHUB_ACTIONS environment variable
      //  is set to `true` then we are NOT in a self-hosted runner.
      // Second: Customer provided credentials manually (IAM User keys stored in GH Secrets)
      if (!process.env.GITHUB_ACTIONS || AccessKeyId) {
        await validateCredentials(roleCredentials.Credentials?.AccessKeyId);
      }
      await exportAccountId(region, maskAccountId);
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
if (require.main === module) {
  (async () => {
    await run();
  })().catch((error) => {
    core.setFailed(error.message);
  });
}
