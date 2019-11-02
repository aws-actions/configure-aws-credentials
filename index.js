const core = require('@actions/core');
const aws = require('aws-sdk');

async function run() {
  try {
    // Get inputs
    const accessKeyId = core.getInput('aws-access-key-id', { required: true });
    const secretAccessKey = core.getInput('aws-secret-access-key', { required: true });
    const region = core.getInput('aws-region', { required: true });
    const sessionToken = core.getInput('aws-session-token', { required: false });

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
    const sts = new aws.STS();
    const identity = await sts.getCallerIdentity().promise();
    const accountId = identity.Account;
    core.setOutput('aws-account-id', accountId);
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
