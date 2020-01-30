## "Configure AWS Credentials" Action For GitHub Actions

Configure AWS credential and region environment variables for use in other GitHub Actions.  The environment variables will be detected by both the AWS SDKs and the AWS CLI to determine the credentials and region to use for AWS API calls.

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

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.

## Credentials

We recommend following [Amazon IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) for the AWS credentials used in GitHub Actions workflows, including:
* Do not store credentials in your repository's code.  You may use [GitHub Actions secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets) to store credentials and redact credentials from GitHub Actions workflow logs.
* [Create an individual IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#create-iam-users) with an access key for use in GitHub Actions workflows, preferably one per repository. Do not use the AWS account root user access key.
* [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege) to the credentials used in GitHub Actions workflows.  Grant only the permissions required to perform the actions in your GitHub Actions workflows.
* [Rotate the credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#rotate-credentials) used in GitHub Actions workflows regularly.
* [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log) of the credentials used in GitHub Actions workflows.

## Assuming a role
If you would like to use some use the credentials you provide to this action to assume a role, you can do so by specifying the role ARN in `role-to-assume`.
These crentials will then be output instead of the ones you have provided.  
The default session duration is 6 hours, but if you would like to adjust this you can pass `role-duration-seconds`.

Example:
```yaml
    - name: Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-2
        role-to-assume: arn:aws:iam::123456789100:role/role-to-assume
        role-duration-seconds: 1200
```

### Session tagging
The session will be tagged with the following tags:  
(`GITHUB_` environement variable definitions can be [found here](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-environment-variables#default-environment-variables))

| Key | Value|
| --- | --- |
| GitHub | "Actions" |
| Repository | GITHUB_REPOSITORY |
| Workflow | GITHUB_WORKFLOW |
| Action | GITHUB_ACTION |
| Actor | GITHUB_ACTOR |
| Branch | GITHUB_REF |
| Commit | GITHUB_SHA |

_Note: all tag values must conform to [the requirements](https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html). Particularly `GITHUB_ACTOR` or `GITHUB_WORKFLOW` will be truncated and if they contain invalid charcters, they will be replaced with an '*'._

## License Summary

This code is made available under the MIT license.
