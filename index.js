const core = require('@actions/core');
const aws = require('aws-sdk');
const assert = require('assert');
const util = require('util');

// The max time that a GitHub action is allowed to run is 6 hours.
// That seems like a reasonable default to use if no role duration is defined.
const MAX_ACTION_RUNTIME = 6 * 3600;

async function assumeRole(params) {
  // Assume a role to get short-lived credentials using longer-lived credentials.
  const isDefined = i => !!i;

  const {roleToAssume, roleDurationSeconds, accessKeyId, secretAccessKey, sessionToken, region} = params;
  assert(
      [roleToAssume, roleDurationSeconds, accessKeyId, secretAccessKey, region].every(isDefined),
      "Missing required input when assuming a Role."
  );

  const {GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_REF, GITHUB_SHA} = process.env;
  assert(
      [GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_REF, GITHUB_SHA].every(isDefined),
      'Missing required environment value. Are you running in GitHub Actions?'
  );

  const endpoint = util.format('https://sts.%s.amazonaws.com', region);

  const sts = new aws.STS({accessKeyId, secretAccessKey, sessionToken, region, endpoint});
  return sts.assumeRole({
    RoleArn: roleToAssume,
    RoleSessionName: 'GitHubActions',
    DurationSeconds: roleDurationSeconds,
    Tags: [
      {Key: 'GitHub', Value: 'Actions'},
      {Key: 'Repository', Value: GITHUB_REPOSITORY},
      {Key: 'Workflow', Value: GITHUB_WORKFLOW},
      {Key: 'Action', Value: GITHUB_ACTION},
      {Key: 'Actor', Value: GITHUB_ACTOR},
      {Key: 'Branch', Value: GITHUB_REF},
      {Key: 'Commit', Value: GITHUB_SHA},
    ]
  })
  .promise()
  .then(function (data) {
    return {
      accessKeyId: data.Credentials.AccessKeyId,
      secretAccessKey: data.Credentials.SecretAccessKey,
      sessionToken: data.Credentials.SessionToken,
    };
  });
}

async function run() {
  try {
    // Get inputs
    const accessKeyId = core.getInput('aws-access-key-id', { required: true });
    const secretAccessKey = core.getInput('aws-secret-access-key', { required: true });
    const region = core.getInput('aws-region', { required: true });
    const sessionToken = core.getInput('aws-session-token', { required: false });
    const maskAccountId = core.getInput('mask-aws-account-id', { required: false });
    const roleToAssume = core.getInput('role-to-assume', {required: false});
    const roleDurationSeconds = core.getInput('role-duration-seconds', {required: false}) || MAX_ACTION_RUNTIME;

    // Get role credentials if configured to do so
    if (roleToAssume) {
      const {accessKeyId, secretAccessKey, sessionToken} = await assumeRole(
          {accessKeyId, secretAccessKey, sessionToken, region, roleToAssume, roleDurationSeconds}
      );
    }

    // Configure the AWS CLI and AWS SDKs using environment variables

    // AWS_ACCESS_KEY_ID:
    // Specifies an AWS access key associated with an IAM user or role
    core.exportVariable('AWS_ACCESS_KEY_ID', accessKeyId);

    // AWS_SECRET_ACCESS_KEY:
    // Specifies the secret key associated with the access key. This is essentially the "password" for the access key.
    core.exportVariable('AWS_SECRET_ACCESS_KEY', secretAccessKey);

    // AWS_SESSION_TOKEN:
    // Specifies the session token value that is required if you are using temporary security credentials.
    if (sessionToken) {
      core.exportVariable('AWS_SESSION_TOKEN', sessionToken);
    }

    // AWS_DEFAULT_REGION and AWS_REGION:
    // Specifies the AWS Region to send requests to
    core.exportVariable('AWS_DEFAULT_REGION', region);
    core.exportVariable('AWS_REGION', region);

    // Get the AWS account ID
    const sts = new aws.STS({
      customUserAgent: 'configure-aws-credentials-for-github-actions'
    });
    const identity = await sts.getCallerIdentity().promise();
    const accountId = identity.Account;
    core.setOutput('aws-account-id', accountId);
    if (!maskAccountId || maskAccountId.toLowerCase() == 'true') {
      core.setSecret(accountId);
    }
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
    run();
}
