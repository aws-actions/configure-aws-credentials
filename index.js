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
  } = params;
  assert(
      [sourceAccountId, roleToAssume, roleDurationSeconds, roleSessionName, region].every(isDefined),
      "Missing required input when assuming a Role."
  );

  const {GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_REF, GITHUB_SHA} = process.env;
  assert(
      [GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_REF, GITHUB_SHA].every(isDefined),
      'Missing required environment value. Are you running in GitHub Actions?'
  );

  const sts = getStsClient(region);

  let roleArn = roleToAssume;
  if (!roleArn.startsWith('arn:aws')) {
    // Supports only 'aws' partition. Customers in other partitions ('aws-cn') will need to provide full ARN
    roleArn = `arn:aws:iam::${sourceAccountId}:role/${roleArn}`;
  }

  const assumeRoleRequest = {
    RoleArn: roleArn,
    RoleSessionName: roleSessionName,
    DurationSeconds: roleDurationSeconds,
    Tags: [
      {Key: 'GitHub', Value: 'Actions'},
      {Key: 'Repository', Value: GITHUB_REPOSITORY},
      {Key: 'Workflow', Value: sanitizeGithubWorkflowName(GITHUB_WORKFLOW)},
      {Key: 'Action', Value: GITHUB_ACTION},
      {Key: 'Actor', Value: sanitizeGithubActor(GITHUB_ACTOR)},
      {Key: 'Branch', Value: GITHUB_REF},
      {Key: 'Commit', Value: GITHUB_SHA},
    ]
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
  const nameWithoutSpecialCharacters = name.replace(/[^\p{L}\p{Z}\p{N}_.:/=+-@]/gu, SANITIZATION_CHARACTER);
  const nameTruncated = nameWithoutSpecialCharacters.slice(0, MAX_TAG_VALUE_LENGTH)
  return nameTruncated
}

function exportCredentials(params){
  // Configure the AWS CLI and AWS SDKs using environment variables and set them as secrets.
  // Setting the credentials as secrets masks them in Github Actions logs
  const {accessKeyId, secretAccessKey, sessionToken} = params;

  // AWS_ACCESS_KEY_ID:
  // Specifies an AWS access key associated with an IAM user or role
  core.exportVariable('AWS_ACCESS_KEY_ID', accessKeyId);
  core.setSecret(accessKeyId);

  // AWS_SECRET_ACCESS_KEY:
  // Specifies the secret key associated with the access key. This is essentially the "password" for the access key.
  core.exportVariable('AWS_SECRET_ACCESS_KEY', secretAccessKey);
  core.setSecret(secretAccessKey);

  // AWS_SESSION_TOKEN:
  // Specifies the session token value that is required if you are using temporary security credentials.
  if (sessionToken) {
    core.exportVariable('AWS_SESSION_TOKEN', sessionToken);
    core.setSecret(sessionToken);
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
  core.setOutput('aws-account-id', accountId);
  if (!maskAccountId || maskAccountId.toLowerCase() == 'true') {
    core.setSecret(accountId);
  }
  return accountId;
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

    const sourceAccountId = await exportAccountId(maskAccountId, region);

    // Get role credentials if configured to do so
    if (roleToAssume) {
      const roleCredentials = await assumeRole({
        sourceAccountId,
        region,
        roleToAssume,
        roleExternalId,
        roleDurationSeconds,
        roleSessionName
      });
      exportCredentials(roleCredentials);
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
