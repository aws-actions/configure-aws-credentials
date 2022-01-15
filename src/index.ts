import * as core from '@actions/core';
import { STSClient, GetCallerIdentityCommand, Credentials } from '@aws-sdk/client-sts';
import { assumeRole, assumeRoleParams } from './assumeRole';
import { errorMessage, getStsClient } from './util';

// The max time that a GitHub action is allowed to run is 6 hours.
// That seems like a reasonable default to use if no role duration is defined.
const MAX_ACTION_RUNTIME = 6 * 3600;
const DEFAULT_ROLE_DURATION_FOR_OIDC_ROLES = 3600;
const ROLE_SESSION_NAME = 'GitHubActions';
const REGION_REGEX = /^[a-z0-9-]+$/g;

function exportCredentials(creds: Partial<Credentials> | undefined) {
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
  const client = getStsClient(region);
  const identity = (await client.send(new GetCallerIdentityCommand({}))).Account;
  if (!identity) {
    throw new Error('Could not get Account ID from STS. Did you set credentials?');
  }
  if (maskAccountId) {
    core.setSecret(identity);
  } else {
    core.setOutput('aws-account-id', identity);
  }
  return identity;
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
  return await client.config.credentials();
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
    const accessKeyId = core.getInput('aws-access-key-id', { required: false });
    const secretAccessKey = core.getInput('aws-secret-access-key', { required: false });
    const region = core.getInput('aws-region', { required: true });
    const sessionToken = core.getInput('aws-session-token', { required: false });
    const maskAccountIdInput = core.getInput('mask-aws-account-id', { required: false }) || 'true';
    const maskAccountId = maskAccountIdInput.toLowerCase() === 'true';
    const roleToAssume = core.getInput('role-to-assume', { required: false });
    const roleExternalId = core.getInput('role-external-id', { required: false });
    const roleDurationSeconds =
      parseInt(core.getInput('role-duration-seconds', { required: false })) || MAX_ACTION_RUNTIME;
    const roleSessionName = core.getInput('role-session-name', { required: false }) || ROLE_SESSION_NAME;
    const roleSkipSessionTaggingInput = core.getInput('role-skip-session-tagging', { required: false }) || 'false';
    const roleSkipSessionTagging = roleSkipSessionTaggingInput.toLowerCase() === 'true';
    const webIdentityTokenFile = core.getInput('web-identity-token-file', { required: false });
    const roleToAssumeRetries = parseInt(core.getInput('role-to-assume', { required: false })) || 5;
    const roleToAssumeRetriesFactor =
      parseInt(core.getInput('role-to-assume-retries-factor', { required: false })) || 2;

    if (accessKeyId) {
      if (!secretAccessKey) {
        throw new Error("'aws-secret-access-key' must be provided if 'aws-access-key-id' is provided");
      }
    }

    if (!region.match(REGION_REGEX)) {
      throw new Error(`Region is not valid: ${region}`);
    }
    exportRegion(region);

    let sourceAccountId: string;
    let assumeRoleParams: assumeRoleParams = {
      region,
      roleDurationSeconds,
      roleSessionName,
      roleToAssume,
      roleExternalId,
      roleSkipSessionTagging,
      roleToAssumeRetries,
      roleToAssumeRetriesFactor,
    };

    switch (true) {
      case !accessKeyId && !!roleToAssume && !webIdentityTokenFile && !!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN: {
        // Assume Role directly using GitHub OIDC provider
        core.debug('Assuming role using GitHub OIDC provider');
        const webIdentityToken = await core.getIDToken('sts.amazonaws.com');
        const roleDurationSeconds =
          parseInt(core.getInput('role-duration-seconds', { required: false })) || DEFAULT_ROLE_DURATION_FOR_OIDC_ROLES;
        assumeRoleParams = { ...assumeRoleParams, roleDurationSeconds, webIdentityToken };
        break;
      }
      case !!accessKeyId && !roleToAssume && !webIdentityTokenFile: {
        // IAM user
        core.debug('Exporting provided IAM user credentials');
        await exportAccountId(region, maskAccountId);
        break;
      }
      case !!accessKeyId && !!roleToAssume && !webIdentityTokenFile: {
        // Assume Role using IAM user credentials
        core.debug('Assuming role using IAM user credentials');
        sourceAccountId = await exportAccountId(region, maskAccountId);
        assumeRoleParams = { ...assumeRoleParams, sourceAccountId };
        break;
      }
      case !!roleToAssume && !!webIdentityTokenFile: {
        // Assume Role using WebIdentity Token File credentials
        core.debug('Assuming role using a WebIdentity Token File');
        sourceAccountId = await exportAccountId(region, maskAccountId);
        assumeRoleParams = { ...assumeRoleParams, webIdentityTokenFile };
        break;
      }
      case !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN: {
        // Running from a self-hosted runner
        core.debug('Exporting credentials from other source (self-hosted runners, etc)');
        await exportAccountId(region, maskAccountId);
        const credentials = (await getStsClient(region).config.credentials()) as Partial<Credentials>;
        exportCredentials(credentials);
        break;
      }
    }

    if (roleToAssume) {
      const roleCredentials = await assumeRole(assumeRoleParams);
      exportCredentials(roleCredentials);
    } else if (accessKeyId || secretAccessKey || sessionToken) {
      exportCredentials({ AccessKeyId: accessKeyId, SecretAccessKey: secretAccessKey, SessionToken: sessionToken });
    }

    await validateCredentials(process.env.AWS_ACCESS_KEY_ID);
  } catch (error) {
    core.setFailed(errorMessage(error));

    const showStackTrace = process.env.SHOW_STACK_TRACE;

    if (showStackTrace === 'true') {
      throw error;
    }
  }
}

if (require.main === module) {
  run();
}
