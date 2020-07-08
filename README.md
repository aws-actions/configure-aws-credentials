## "Configure AWS Credentials" Action For GitHub Actions

Configure AWS credential and region environment variables for use in other GitHub Actions.  The environment variables will be detected by both the AWS SDKs and the AWS CLI to determine the credentials and region to use for AWS API calls.

**Table of Contents**

<!-- toc -->

- [Usage](#usage)
- [Credentials](#credentials)
- [Assuming a Role](#assuming-a-role)
    + [Permissions for assuming a role](#permissions-for-assuming-a-role)
    + [Session tagging](#session-tagging)
- [Self-Hosted Runners](#self-hosted-runners)
- [License Summary](#license-summary)
- [Security Disclosures](#security-disclosures)

<!-- tocstop -->

## Usage

Add the following step to your workflow:

```yaml
    - name: Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-2
```

For example, you can use this action with the AWS CLI available in [GitHub's hosted virtual environments](https://help.github.com/en/actions/reference/software-installed-on-github-hosted-runners).
You can also run this action multiple times to use different AWS accounts, regions, or IAM roles in the same GitHub Actions workflow job.

```yaml
jobs:
  deploy:
    name: Upload to Amazon S3
    runs-on: ubuntu-latest

    steps:
    - name: Checkout
      uses: actions/checkout@v2

    - name: Configure AWS credentials from Test account
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.TEST_AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.TEST_AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1

    - name: Copy files to the test website with the AWS CLI
      run: |
        aws s3 sync . s3://my-s3-test-website-bucket

    - name: Configure AWS credentials from Production account
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.PROD_AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.PROD_AWS_SECRET_ACCESS_KEY }}
        aws-region: us-west-2

    - name: Copy files to the production website with the AWS CLI
      run: |
        aws s3 sync . s3://my-s3-prod-website-bucket
```

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.

## Credentials

We recommend following [Amazon IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) for the AWS credentials used in GitHub Actions workflows, including:
* Do not store credentials in your repository's code.  You may use [GitHub Actions secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets) to store credentials and redact credentials from GitHub Actions workflow logs.
* [Create an individual IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#create-iam-users) with an access key for use in GitHub Actions workflows, preferably one per repository. Do not use the AWS account root user access key.
* [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege) to the credentials used in GitHub Actions workflows.  Grant only the permissions required to perform the actions in your GitHub Actions workflows.
* [Rotate the credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#rotate-credentials) used in GitHub Actions workflows regularly.
* [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log) of the credentials used in GitHub Actions workflows.

## Assuming a Role
If you would like to use the static credentials you provide to this action to assume a role, you can do so by specifying the role ARN in `role-to-assume`.
The role credentials will then be configured in the Actions environment instead of the static credentials you have provided.
The default session duration is 6 hours, but if you would like to adjust this you can pass a duration to `role-duration-seconds`.
The default session name is GitHubActions, and you can modify it by specifying the desired name in `role-session-name`.

Example:
```yaml
    - name: Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-2
        role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}
        role-external-id: ${{ secrets.AWS_ROLE_EXTERNAL_ID }}
        role-duration-seconds: 1200
        role-session-name: MySessionName
```
In this example, the secret `AWS_ROLE_TO_ASSUME` contains a string like `arn:aws:iam::123456789100:role/my-github-actions-role`.  To assume a role in the same account as the static credentials, you can simply specify the role name, like `role-to-assume: my-github-actions-role`.

### Permissions for assuming a role

In order to assume a role, the IAM user for the static credentials must have the following permissions:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": [
                "sts:AssumeRole",
                "sts:TagSession"
            ],
            "Resource": "arn:aws:iam::123456789012:role/my-github-actions-role",
            "Effect": "Allow"
        }
    ]
}
```

The role's trust policy must allow the IAM user to assume the role:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowIamUserAssumeRole",
            "Effect": "Allow",
            "Action": "sts:AssumeRole",
            "Principal": {"AWS": "arn:aws:iam::123456789012:user/my-github-actions-user"},
            "Condition": {
                "StringEquals": {"sts:ExternalId": "Example987"}
            }
        },
        {
            "Sid": "AllowPassSessionTags",
            "Effect": "Allow",
            "Action": "sts:TagSession",
            "Principal": {"AWS": "arn:aws:iam::123456789012:user/my-github-actions-user"}
        }
    ]
}
```

### Session tagging
The session will have the name "GitHubActions" and be tagged with the following tags:
(`GITHUB_` environment variable definitions can be [found here](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-environment-variables#default-environment-variables))

| Key | Value|
| --- | --- |
| GitHub | "Actions" |
| Repository | GITHUB_REPOSITORY |
| Workflow | GITHUB_WORKFLOW |
| Action | GITHUB_ACTION |
| Actor | GITHUB_ACTOR |
| Branch | GITHUB_REF |
| Commit | GITHUB_SHA |

_Note: all tag values must conform to [the requirements](https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html). Particularly, `GITHUB_WORKFLOW` will be truncated if it's too long. If `GITHUB_ACTOR` or `GITHUB_WORKFLOW` contain invalid charcters, the characters will be replaced with an '*'._

The action will use session tagging by default during role assumption. You can skip this session tagging by providing `role-skip-session-tagging` as true in the action's inputs:

```yaml
      uses: aws-actions/configure-aws-credentials@v1
      with:
        role-skip-session-tagging: true
```

## Self-Hosted Runners

If you run your GitHub Actions in a [self-hosted runner](https://help.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners) that already has access to AWS credentials, such as an EC2 instance, then you do not need to provide IAM user access key credentials to this action.

If no access key credentials are given in the action inputs, this action will use credentials from the runner environment using the [default methods for the AWS SDK for Javascript](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html).

You can use this action to simply configure the region and account ID in the environment, and then use the runner's credentials for all AWS API calls made by your Actions workflow:
```yaml
uses: aws-actions/configure-aws-credentials@v1
with:
  aws-region: us-east-2
```
In this case, your runner's credentials must have permissions to call any AWS APIs called by your Actions workflow.

Or, you can use this action to assume a role, and then use the role credentials for all AWS API calls made by your Actions workflow:
```yaml
uses: aws-actions/configure-aws-credentials@v1
with:
  aws-region: us-east-2
  role-to-assume: my-github-actions-role
```
In this case, your runner's credentials must have permissions to assume the role.

## License Summary

This code is made available under the MIT license.

## Security Disclosures

If you would like to report a potential security issue in this project, please do not create a GitHub issue.  Instead, please follow the instructions [here](https://aws.amazon.com/security/vulnerability-reporting/) or [email AWS security directly](mailto:aws-security@amazon.com).
