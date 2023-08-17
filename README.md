## Configure AWS Credentials for GitHub Actions
Configure your AWS credentials and region environment variables for use in other
GitHub Actions. This action implements the AWS SDK credential resolution chain
and exports environment variables for your other Actions to use. Environment
variable exports are detected by both the AWS SDKs and the AWS CLI for AWS API
calls.

### Launch of Configure AWS Credentials v3

We have recently release `v3` of Configure AWS Credentials! With this new release we have migrated the code to TypeScript, and have also migrated away from using `v2` of the JavaScript AWS SDK, to using `v3`. This should eliminate the warning you have seen in your workflow logs about `v2` deprecation

In addition to the refactored codebase, we have also introduced some changes to existing functionality, added some new features, and fixed some bugs.

**Changes to existing functionality**

- By default, the assumed role credentials will only be valid for one hour in _all_ use cases. This is changed from 6 hours in `v2`. You can adjust this value with the `role-duration-seconds` input.
- By default, your account ID will not be masked in workflow logs. This is changed from being masked by default in `v2`. Account IDs are not considered sensitive information, so this change reflects that. You can mask your account ID in workflow logs by setting the `mask-aws-account-id` input to `true`.

**New features**

- You can now configure retry settings for when the STS call fails. By default, we retry with exponential backoff `12` times. You can disable this behavior altogether by setting the `disable-retry` input to `true`, or you can configure the number of times it retries with the `retry-max-attempts` input.
- You can now set the returned credentials as step outputs. To do this, you can set the `output-credentials` prop to `true`.
- There's now an option to clear the AWS related environment variables at the start of the action. Clearing these variables are often a workaround for issues, so enabling this can be helpful as a built-in workaround if existing credentials are interfering with the action. You can enable this by setting the `unset-current-credentials` input to `true`.

**Bug fixes**

A number of bugs have been fixed. You can view the full list of resolved issues on the `v3` release PR.

### Table of Contents
<!-- toc -->
- [Usage](#usage)
- [Credentials](#credentials)
- [Assuming a Role](#assuming-a-role)
    + [Session tagging](#session-tagging)
    + [Sample IAM Role Permissions](#sample-iam-role-cloudformation-template)
- [OIDC](#OIDC)
- [Self-Hosted Runners](#self-hosted-runners)
    + [Proxy Configuration](#proxy-configuration)
- [License Summary](#license-summary)
- [Security Disclosures](#security-disclosures)
<!-- tocstop -->

## Usage
We support four methods for fetching credentials from AWS, but we recommend that
you use GitHub's OIDC provider in conjunction with a configured AWS IAM
Identity Provider endpoint.

To do that, you would add the following step to your workflow:

```yaml
    - name: Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v3
      with:
        role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
        aws-region: us-east-2
```
This will cause the action to perform an [`AssumeRoleWithWebIdentity`](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html) call and
return temporary security credentials for use by other steps in your workflow. In order for
this to work, you'll need to preconfigure the IAM Identity Provider in your AWS account
(see [Assuming a Role](#assuming-a-role) for details).

You can use this action with the AWS CLI available in
[GitHub's hosted virtual environments](https://help.github.com/en/actions/reference/software-installed-on-github-hosted-runners) or run this action multiple times
to use different AWS accounts, regions, or IAM roles in the same GitHub Actions
workflow. As an example, here is a complete workflow file that uploads artifacts
to Amazon S3.

```yaml
jobs:
  deploy:
    name: Upload to Amazon S3
    runs-on: ubuntu-latest
    # These permissions are needed to interact with GitHub's OIDC Token endpoint.
    permissions:
      id-token: write
      contents: read
    steps:
    - name: Checkout
      uses: actions/checkout@v3
    - name: Configure AWS credentials from Test account
      uses: aws-actions/configure-aws-credentials@v3
      with:
        role-to-assume: arn:aws:iam::111111111111:role/my-github-actions-role-test
        aws-region: us-east-1
    - name: Copy files to the test website with the AWS CLI
      run: |
        aws s3 sync . s3://my-s3-test-website-bucket
    - name: Configure AWS credentials from Production account
      uses: aws-actions/configure-aws-credentials@v3
      with:
        role-to-assume: arn:aws:iam::222222222222:role/my-github-actions-role-prod
        aws-region: us-west-2
    - name: Copy files to the production website with the AWS CLI
      run: |
        aws s3 sync . s3://my-s3-prod-website-bucket
```

See [action.yml](action.yml) for the full documentation for this action's inputs
and outputs.

## Credentials

We recommend following
[Amazon IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
for the AWS credentials used in GitHub Actions workflows, including:
  * Do not store credentials in your repository's code.
  * [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege) to the credentials used in GitHub Actions
  workflows. Grant only the permissions required to perform the actions in your
  GitHub Actions workflows.
  * [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log) of the credentials used in GitHub Actions workflows.

## Assuming a Role
There are five different supported ways to retrieve credentials:

- Using GitHub's OIDC provider (`AssumeRoleWithWebIdentity`)
- Proceeding as an IAM user (No STS call is made)
- Using access keys as action input (`AssumeRole`)
- Using a WebIdentity Token File (`AssumeRoleWithWebIdentity`)
- Using existing credentials in your runner (`AssumeRole`)

We recommend using [GitHub's OIDC provider](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) to get short-lived credentials needed for your actions. [See](#OIDC) for more information on how to setup your AWS account to assume a role with OIDC. 

The following table describes which method is used based on which values are supplied to the Action:

| **Identity Used**                                               | `aws-access-key-id` | `role-to-assume` | `web-identity-token-file` | `role-chaining` |
| --------------------------------------------------------------- | ------------------- | ---------------- | ------------------------- | - |
| [✅ Recommended] Assume Role directly using GitHub OIDC provider |                     | ✔                |                           | |
| IAM User                                                        | ✔                   |                  |                           | |
| Assume Role using IAM User credentials                          | ✔                   | ✔                |                           | |
| Assume Role using WebIdentity Token File credentials            |                     | ✔                | ✔                         | |
| Assume Role using existing credentials | | ✔ | | ✔ |

### Credential Lifetime
The default session duration is **1 hour**.

If you would like to adjust this you can pass a duration to `role-duration-seconds`, but the duration cannot exceed the maximum that was defined when the IAM Role was created.
The default session name is GitHubActions, and you can modify it by specifying the desired name in `role-session-name`.
The default audience is `sts.amazonaws.com` which you can replace by specifying the desired audience name in `audience`.

### Session tagging
The session will have the name "GitHubActions" and be tagged with the following
tags: (`GITHUB_` environment variable definitions can be
[found here](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-environment-variables#default-environment-variables))

| Key        | Value             |
| ---------- | ----------------- |
| GitHub     | "Actions"         |
| Repository | GITHUB_REPOSITORY |
| Workflow   | GITHUB_WORKFLOW   |
| Action     | GITHUB_ACTION     |
| Actor      | GITHUB_ACTOR      |
| Branch     | GITHUB_REF        |
| Commit     | GITHUB_SHA        |

_Note: all tag values must conform to
[the requirements](https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html).
Particularly, `GITHUB_WORKFLOW` will be truncated if it's too long. If
`GITHUB_ACTOR` or `GITHUB_WORKFLOW` contain invalid characters, the characters
will be replaced with an '*'._

The action will use session tagging by default during role assumption. 
Note that for WebIdentity role assumption, the session tags have to be included
in the encoded WebIdentity token. This means that Tags can only be supplied by
the OIDC provider and not set during the AssumeRoleWithWebIdentity API call
within the Action. You can skip this session tagging by providing
`role-skip-session-tagging` as true in the action's inputs:
```yaml
      uses: aws-actions/configure-aws-credentials@v3
      with:
        role-skip-session-tagging: true
```

### Inline session policy
An IAM policy in stringified JSON format that you want to use as an inline session policy.
Depending on preferences, the JSON could be written on a single line like this:
```yaml
      uses: aws-actions/configure-aws-credentials@v3
      with:
         inline-session-policy: '{"Version":"2012-10-17","Statement":[{"Sid":"Stmt1","Effect":"Allow","Action":"s3:List*","Resource":"*"}]}'
```
Or we can have a nicely formatted JSON as well:
```yaml
      uses: aws-actions/configure-aws-credentials@v3
      with:
         inline-session-policy: >-
          {
           "Version": "2012-10-17",
           "Statement": [
            {
             "Sid":"Stmt1",
             "Effect":"Allow",
             "Action":"s3:List*",
             "Resource":"*"
            }
           ]
          }
```

### Managed session policies
The Amazon Resource Names (ARNs) of the IAM managed policies that you want to use as managed session policies.
The policies must exist in the same account as the role. You can pass a single managed policy like this:
```yaml
      uses: aws-actions/configure-aws-credentials@v3
      with:
         managed-session-policies: arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
```
And we can pass multiple managed policies likes this:
```yaml
      uses: aws-actions/configure-aws-credentials@v3
      with:
         managed-session-policies: |
          arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
          arn:aws:iam::aws:policy/AmazonS3OutpostsReadOnlyAccess
```

## OIDC

### Sample IAM OIDC CloudFormation Template
If you choose to use GitHub's OIDC provider, you must first set up federation
with the provider in as an IAM IdP. The GitHub OIDC provider only needs to be
created once per account (i.e. multiple IAM Roles that can be assumed by the
GitHub's OIDC can share a single OIDC Provider).

Note that the thumbprint has been set to all F's because the thumbprint is not
used when authenticating `tokens.actions.githubusercontent.com`. Instead, IAM
uses its library of trusted CAs to authenticate. However, this value is still
required by the API.

This CloudFormation template will configure the IdP for you. You can copy the
template below, or load it from here: 
https://d38mtn6aq9zhn6.cloudfront.net/configure-aws-credentials-latest.yml

```yaml
Parameters:
  GitHubOrg:
    Description: Name of GitHub organization/user (case sensitive)
    Type: String
  RepositoryName:
    Description: Name of GitHub repository (case sensitive)
    Type: String
  OIDCProviderArn:
    Description: Arn for the GitHub OIDC Provider.
    Default: ""
    Type: String
  OIDCAudience:
    Description: Audience supplied to configure-aws-credentials.
    Default: "sts.amazonaws.com"
    Type: String

Conditions:
  CreateOIDCProvider: !Equals 
    - !Ref OIDCProviderArn
    - ""

Resources:
  Role:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Statement:
          - Effect: Allow
            Action: sts:AssumeRoleWithWebIdentity
            Principal:
              Federated: !If 
                - CreateOIDCProvider
                - !Ref GithubOidc
                - !Ref OIDCProviderArn
            Condition:
              StringEquals:
                token.actions.githubusercontent.com:aud: !Ref OIDCAudience
              StringLike:
                token.actions.githubusercontent.com:sub: !Sub repo:${GitHubOrg}/${RepositoryName}:*

  GithubOidc:
    Type: AWS::IAM::OIDCProvider
    Condition: CreateOIDCProvider
    Properties:
      Url: https://token.actions.githubusercontent.com
      ClientIdList: 
        - sts.amazonaws.com
      ThumbprintList:
        - ffffffffffffffffffffffffffffffffffffffff

Outputs:
  Role:
    Value: !GetAtt Role.Arn 
```

To align with the Amazon IAM best practice of
[granting least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege), the assume role policy document should contain a
[`Condition`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition.html) that specifies a subject allowed to assume the role. Without a subject
condition, any GitHub user or repository could potentially assume the role. The
subject can be scoped to a GitHub organization and repository as shown in the
CloudFormation template. Additional claim conditions can be added for higher
specificity as explained in the
[GitHub documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect).
Due to implementation details, not every OIDC claim is presently supported by
IAM.

For further information on OIDC and GitHub Actions, please see:

* [AWS docs: Creating OpenID Connect (OIDC) identity providers](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
* [AWS docs: IAM JSON policy elements: Condition](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition.html)
* [GitHub docs: About security hardening with OpenID Connect](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
* [GitHub docs: Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
* [GitHub changelog: GitHub Actions: Secure cloud deployments with OpenID Connect](https://github.blog/changelog/2021-10-27-github-actions-secure-cloud-deployments-with-openid-connect/)

## Self-Hosted Runners

If you run your GitHub Actions in a
[self-hosted runner](https://help.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners) that already has access to AWS credentials, such as
an EC2 instance, then you do not need to provide IAM user access key credentials
to this action. We will use the standard AWS JavaScript SDK credential
resolution methods to find your credentials, so if the AWS JS SDK can
authenticate on your runner, this Action will as well.

If no access key credentials are given in the action inputs, this action will
use credentials from the runner environment using the
[default methods for the AWS SDK for Javascript](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).

You can use this action to simply configure the region and account ID in the
environment, and then use the runner's credentials for all AWS API calls made by
your Actions workflow:
```yaml
uses: aws-actions/configure-aws-credentials@v3
with:
  aws-region: us-east-2
```
In this case, your runner's credentials must have permissions to call any AWS
APIs called by your Actions workflow.

Or, you can use this action to assume a role, and then use the role credentials
for all AWS API calls made by your Actions workflow:
```yaml
uses: aws-actions/configure-aws-credentials@v3
with:
  aws-region: us-east-2
  role-to-assume: my-github-actions-role
```
In this case, your runner's credentials must have permissions to assume the
role.

You can also assume a role using a web identity token file, such as if using
[Amazon EKS IRSA](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts-technical-overview.html). Pods running in EKS
worker nodes that do not run as root can use this file to assume a role with a
web identity.

### Proxy Configuration

If you run in self-hosted environments and in secured environment where you need
use a specific proxy you can set it in the action manually.

Additionally this action will always consider already configured proxy in the
environment.

Manually configured proxy:
```yaml
uses: aws-actions/configure-aws-credentials@v3
with:
  aws-region: us-east-2
  role-to-assume: my-github-actions-role
  http-proxy: "http://companydomain.com:3128"
```

Proxy configured in the environment variable:
```bash
# Your environment configuration
HTTP_PROXY="http://companydomain.com:3128"
```

The action will read the underlying proxy configuration from the environment and
you don't need to configure it in the action.

### Use with the AWS CLI
This workflow does _not_ install the [AWS CLI](https://aws.amazon.com/cli/)
into your environment. Self-hosted runners that intend to run this action prior
to executing `aws` commands need to have the AWS CLI
[installed](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)
if it's not already present. 
Most [GitHub hosted runner environments](https://github.com/actions/virtual-environments)
should include the AWS CLI by default.

## Examples

### AssumeRoleWithWebIdentity (recommended)
```yaml
    - name: Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v3
      with:
        aws-region: us-east-2
        role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
        role-session-name: MySessionName
```
In this example, the Action will load the OIDC token from the GitHub-provided environment variable and use it to assume the role `arn:aws:iam::123456789100:role/my-github-actions-role` with the session name `MySessionName`.

### AssumeRole with role previously assumed by action in same workflow
```yaml
    - name: Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v3
      with:
        aws-region: us-east-2
        role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
        role-session-name: MySessionName
    - name: Configure other AWS Credentials
      uses: aws-actions/configure-aws-credentials@v3
      with:
        aws-region: us-east-2
        role-to-assume: arn:aws:iam::987654321000:role/my-second-role
        role-session-name: MySessionName
        role-chaining: true
```
In this two-step example, the first step will use OIDC to assume the role `arn:aws:iam::123456789100:role/my-github-actions-role` just as in the prior example. Following that, a second step will use this role to assume a different role, `arn:aws:iam::987654321000:role/my-second-role`.

### AssumeRole with static IAM credentials in repository secrets
```yaml
    - name: Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v3
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

### AssumeRoleWithWebIdentity using a custom audience
```yaml
    - name: Configure AWS Credentials for Beta Customers
      uses: aws-actions/configure-aws-credentials@v3
      with:
        audience: beta-customers
        aws-region: us-east-3
        role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
        role-session-name: MySessionName
```
In this example, the audience has been changed from the default to use a different audience name `beta-customers`. This can help ensure that the role can only affect those AWS accounts whose GitHub OIDC providers have explicitly opted in to the `beta-customers` label.

Changing the default audience may be necessary when using non-default [AWS partitions](https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html).
 
## License Summary
This code is made available under the MIT license.

## Security Disclosures
If you would like to report a potential security issue in this project, please do not create a GitHub issue.  Instead, please follow the instructions [here](https://aws.amazon.com/security/vulnerability-reporting/) or [email AWS security directly](mailto:aws-security@amazon.com).
