const path = require('path');
const core = require('@actions/core');
const io = require('@actions/io');

async function run() {
  try {
    // Get inputs
    const accessKeyId = core.getInput('aws-access-key-id', { required: true });
    const secretAccessKey = core.getInput('aws-secret-access-key', { required: true });
    const defaultRegion = core.getInput('aws-default-region', { required: true });
    const outputFormat = core.getInput('aws-default-output', { required: false });
    const awsHome = path.join(process.env.RUNNER_TEMP, '.aws');

    // Ensure awsHome is a directory that exists
    await io.mkdirP(awsHome);

    // Configure the AWS CLI using environment variables

    // AWS_ACCESS_KEY_ID:
    // Specifies an AWS access key associated with an IAM user or role
    core.exportVariable('AWS_ACCESS_KEY_ID', accessKeyId);

    // AWS_SECRET_ACCESS_KEY:
    // Specifies the secret key associated with the access key. This is essentially the "password" for the access key.
    core.exportVariable('AWS_SECRET_ACCESS_KEY', secretAccessKey);

    // AWS_DEFAULT_REGION:
    // Specifies the AWS Region to send requests to
    core.exportVariable('AWS_DEFAULT_REGION', defaultRegion);

    // AWS_DEFAULT_OUTPUT:
    // Specifies the output format to use
    core.exportVariable('AWS_DEFAULT_OUTPUT', outputFormat);

    // AWS_CONFIG_FILE:
    // Specifies the location of the file that the AWS CLI uses to store configuration profiles.
    core.exportVariable('AWS_CONFIG_FILE', path.join(awsHome, 'config'));

    // AWS_SHARED_CREDENTIALS_FILE:
    // Specifies the location of the file that the AWS CLI uses to store access keys.
    core.exportVariable('AWS_SHARED_CREDENTIALS_FILE', path.join(awsHome, 'credentials'));
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
