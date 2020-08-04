const core = require('@actions/core');
const aws = require('aws-sdk');
const assert = require('assert');

// The max time that a GitHub action is allowed to run is 6 hours.
// That seems like a reasonable default to use if no role duration is defined.
const MAX_ACTION_RUNTIME = 6 * 3600;
const USER_AGENT = 'configure-aws-credentials-for-github-actions';
const MAX_TAG_VALUE_LENGTH = 256;
const SANITIZATION_CHARACTER = '_';
const ROLE_SESSION_NAME = 'GitHubActions';
const REGION_REGEX = /^[a-z0-9-]+$/g;

async function assumeRole(params) {
  // Assume a role to get short-lived credentials using longer-lived credentials.
  const isDefined = i => !!i;

  const {
    sourceAccountId,
    roleToAssume,
    roleExternalId,
    roleDurationSeconds,
    roleSessionName,
    region,
    roleSkipSessionTagging
  } = params;
  assert(
      [sourceAccountId, roleToAssume, roleDurationSeconds, roleSessionName, region].every(isDefined),
      "Missing required input when assuming a Role."
  );

  const {GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_SHA} = process.env;
  assert(
      [GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_SHA].every(isDefined),
      'Missing required environment value. Are you running in GitHub Actions?'
  );

  const sts = getStsClient(region);

  let roleArn = roleToAssume;
  if (!roleArn.startsWith('arn:aws')) {
    // Supports only 'aws' partition. Customers in other partitions ('aws-cn') will need to provide full ARN
    roleArn = `arn:aws:iam::${sourceAccountId}:role/${roleArn}`;
  }
  const tagArray = [
    {Key: 'GitHub', Value: 'Actions'},
    {Key: 'Repository', Value: GITHUB_REPOSITORY},
    {Key: 'Workflow', Value: sanitizeGithubWorkflowName(GITHUB_WORKFLOW)},
    {Key: 'Action', Value: GITHUB_ACTION},
    {Key: 'Actor', Value: sanitizeGithubActor(GITHUB_ACTOR)},
    {Key: 'Commit', Value: GITHUB_SHA},
  ];

  if (isDefined(process.env.GITHUB_REF)) {
    tagArray.push({Key: 'Branch', Value: process.env.GITHUB_REF});
  }

  const roleSessionTags = roleSkipSessionTagging ? undefined : tagArray;

  const assumeRoleRequest = {
    RoleArn: roleArn,
    RoleSessionName: roleSessionName,
    DurationSeconds: roleDurationSeconds,
    Tags: roleSessionTags
  };

  if (roleExternalId) {
    assumeRoleRequest.ExternalId = roleExternalId;
  }

  return sts.assumeRole(assumeRoleRequest)
  .promise()
  .then(function (data) {
    return {
      accessKeyId: data.Credentials.AccessKeyId,
      secretAccessKey: data.Credentials.SecretAccessKey,
      sessionToken: data.Credentials.SessionToken,
    };
  });
}

function sanitizeGithubActor(actor) {
  // In some circumstances the actor may contain square brackets. For example, if they're a bot ('[bot]')
  // Square brackets are not allowed in AWS session tags
  return actor.replace(/\[|\]/g, SANITIZATION_CHARACTER)
}

function sanitizeGithubWorkflowName(name) {
  // Workflow names can be almost any valid UTF-8 string, but tags are more restrictive.
  // This replaces anything not conforming to the tag restrictions by inverting the regular expression.
  // See the AWS documentation for constraint specifics https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html.
  const nameWithoutSpecialCharacters = name.replace(/[^\p{L}\p{Z}\p{N}_:/=+.-@-]/gu, SANITIZATION_CHARACTER);
  const nameTruncated = nameWithoutSpecialCharacters.slice(0, MAX_TAG_VALUE_LENGTH)
  return nameTruncated
}

function exportCredentials(params){
  // Configure the AWS CLI and AWS SDKs using environment variables and set them as secrets.
  // Setting the credentials as secrets masks them in Github Actions logs
  const {accessKeyId, secretAccessKey, sessionToken} = params;

  // AWS_ACCESS_KEY_ID:
  // Specifies an AWS access key associated with an IAM user or role
  core.setSecret(accessKeyId);
  core.exportVariable('AWS_ACCESS_KEY_ID', accessKeyId);

  // AWS_SECRET_ACCESS_KEY:
  // Specifies the secret key associated with the access key. This is essentially the "password" for the access key.
  core.setSecret(secretAccessKey);
  core.exportVariable('AWS_SECRET_ACCESS_KEY', secretAccessKey);

  // AWS_SESSION_TOKEN:
  // Specifies the session token value that is required if you are using temporary security credentials.
  if (sessionToken) {
    core.setSecret(sessionToken);
    core.exportVariable('AWS_SESSION_TOKEN', sessionToken);
  } else if (process.env.AWS_SESSION_TOKEN) {
    // clear session token from previous credentials action
    core.exportVariable('AWS_SESSION_TOKEN', '');
  }
}

function exportRegion(region) {
  // AWS_DEFAULT_REGION and AWS_REGION:
  // Specifies the AWS Region to send requests to
  core.exportVariable('AWS_DEFAULT_REGION', region);
  core.exportVariable('AWS_REGION', region);
}

async function exportAccountId(maskAccountId, region) {
  // Get the AWS account ID
  const sts = getStsClient(region);
  const identity = await sts.getCallerIdentity().promise();
  const accountId = identity.Account;
  if (!maskAccountId || maskAccountId.toLowerCase() == 'true') {
    core.setSecret(accountId);
  }
  core.setOutput('aws-account-id', accountId);
  return accountId;
}

function loadCredentials() {
  // Force the SDK to re-resolve credentials with the default provider chain.
  //
  // This action typically sets credentials in the environment via environment variables.
  // The SDK never refreshes those env-var-based credentials after initial load.
  // In case there were already env-var creds set in the actions environment when this action
  // loaded, this action needs to refresh the SDK creds after overwriting those environment variables.
  //
  // The credentials object needs to be entirely recreated (instead of simply refreshed),
  // because the credential object type could change when this action writes env var creds.
  // For example, the first load could return EC2 instance metadata credentials
  // in a self-hosted runner, and the second load could return environment credentials
  // from an assume-role call in this action.
  aws.config.credentials = null;

  return new Promise((resolve, reject) => {
    aws.config.getCredentials((err) => {
      if (err) {
        reject(err);
      }
      resolve(aws.config.credentials);
    })
  });
}

async function validateCredentials(expectedAccessKeyId) {
  let credentials;
  try {
    credentials = await loadCredentials();

    if (!credentials.accessKeyId) {
      throw new Error('Access key ID empty after loading credentials');
    }
  } catch (error) {
    throw new Error(`Credentials could not be loaded, please check your action inputs: ${error.message}`);
  }

  const actualAccessKeyId = credentials.accessKeyId;

  if (expectedAccessKeyId && expectedAccessKeyId != actualAccessKeyId) {
    throw new Error('Unexpected failure: Credentials loaded by the SDK do not match the access key ID configured by the action');
  }
}

function getStsClient(region) {
  return new aws.STS({
    region,
    stsRegionalEndpoints: 'regional',
    customUserAgent: USER_AGENT
  });
}

async function run() {
  try {
    // Get inputs
    const accessKeyId = core.getInput('aws-access-key-id', { required: false });
    const secretAccessKey = core.getInput('aws-secret-access-key', { required: false });
    const region = core.getInput('aws-region', { required: true });
    const sessionToken = core.getInput('aws-session-token', { required: false });
    const maskAccountId = core.getInput('mask-aws-account-id', { required: false });
    const roleToAssume = core.getInput('role-to-assume', {required: false});
    const roleExternalId = core.getInput('role-external-id', { required: false });
    const roleDurationSeconds = core.getInput('role-duration-seconds', {required: false}) || MAX_ACTION_RUNTIME;
    const roleSessionName = core.getInput('role-session-name', { required: false }) || ROLE_SESSION_NAME;
    const roleSkipSessionTagging = core.getInput('role-skip-session-tagging', { required: false });
  
    if (!region.match(REGION_REGEX)) {
      throw new Error(`Region is not valid: ${region}`);
    }

    exportRegion(region);

    // Always export the source credentials and account ID.
    // The STS client for calling AssumeRole pulls creds from the environment.
    // Plus, in the assume role case, if the AssumeRole call fails, we want
    // the source credentials and accound ID to already be masked as secrets
    // in any error messages.
    if (accessKeyId) {
      if (!secretAccessKey) {
        throw new Error("'aws-secret-access-key' must be provided if 'aws-access-key-id' is provided");
      }

      exportCredentials({accessKeyId, secretAccessKey, sessionToken});
    }

    // Regardless of whether any source credentials were provided as inputs,
    // validate that the SDK can actually pick up credentials.  This validates
    // cases where this action is on a self-hosted runner that doesn't have credentials
    // configured correctly, and cases where the user intended to provide input
    // credentials but the secrets inputs resolved to empty strings.
    await validateCredentials(accessKeyId);

    const sourceAccountId = await exportAccountId(maskAccountId, region);

    // Get role credentials if configured to do so
    if (roleToAssume) {
      const roleCredentials = await assumeRole({
        sourceAccountId,
        region,
        roleToAssume,
        roleExternalId,
        roleDurationSeconds,
        roleSessionName,
        roleSkipSessionTagging
      });
      exportCredentials(roleCredentials);
      await validateCredentials(roleCredentials.accessKeyId);
      await exportAccountId(maskAccountId, region);
    }
  }
  catch (error) {
    core.setFailed(error.message);

    const showStackTrace = process.env.SHOW_STACK_TRACE;

    if (showStackTrace === 'true') {
      throw(error)
    }

  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
    run();
}
