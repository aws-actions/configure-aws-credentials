## Configure AWS Credentials for GitHub Actions
Configure your AWS credentials and region environment variables for use in other
GitHub Actions. This action implements the AWS SDK credential resolution chain
and exports environment variables for your other Actions to use. Environment
variable exports are detected by both the AWS SDKs and the AWS CLI for AWS API
calls.

---

### Recent News

#### Long-term credentials warning (10/3/23)

We have added a warning when using long-term credentials to access AWS
(IAM access keys and secret keys). Using long-term credentials requires you
to create IAM users and properly secure the access keys to prevent their disclosure.
A better approach is to use [GitHub's support for OpenID Connect](#OIDC) to authenticate
using an IAM role to generate temporary security credentials.

#### v4 Announcement (9/11/23)

We have just released `v4` of Configure AWS Credentials. The only thing that
changed from `v3` is that the action now runs on `node20` instead of `node16`. If using a self-hosted runner, specify [v2.311.0](https://github.com/actions/runner/releases/tag/v2.311.0) or above for `node20` support.
You can still see the `v3` announcement below, as it is still recent.

#### v3 Announcement (8/23/23)

We have recently released `v3` of Configure AWS Credentials! With this new
release we have migrated the code to TypeScript, and have also migrated away
from using `v2` of the JavaScript AWS SDK. This should eliminate the warning you
have seen in your workflow logs about `v2` deprecation.

In addition to the refactored codebase, we have also introduced some changes to
existing functionality, added some new features, and fixed some bugs. These
changes should be backwards compatible with your existing workflows.

**Notable changes to existing functionality**

- By default, the assumed role credentials will only be valid for one hour in
_all_ use cases. This is changed from 6 hours in `v2`. You can adjust this value
with the `role-duration-seconds` input.
- By default, your account ID will not be masked in workflow logs. This was
changed from being masked by default in the previous version. AWS does not consider
account IDs as sensitive information, so this change reflects that stance. You
can revert to the old default and mask your account ID in workflow logs by
setting the `mask-aws-account-id` input to `true`.

**New features**

- You can now configure retry settings in case your STS call fails. By default,
we retry with exponential backoff twelve times. You can disable this behavior
altogether by setting the `disable-retry` input to `true`, or you can configure
the number of times the action will retry with the `retry-max-attempts` input.
- You can now set the returned credentials as action step outputs. To do this,
you can set the `output-credentials` prop to `true`.
- There's now an option to clear the AWS-related environment variables at the
start of the action. Clearing these variables is often a workaround for 
problems, so enabling this can be helpful if existing credentials or environment
variables are interfering with the action. You can enable this by setting the
`unset-current-credentials` input to `true`.

**Bug fixes**

You can find a list of bugs that have been fixed in v3 in the
[changelog](./CHANGELOG.md).

---

### Table of Contents
<!-- toc -->
- [Overview](#overview)
- [Security recommendations](#security-recommendations)
- [Using this action](#using-this-action)
    + [Credential Lifetime](#credential-lifetime)
    + [External ID](#external-id)
    + [Session tagging](#session-tagging-and-name)
    + [Sample IAM Role Permissions](#sample-iam-role-cloudformation-template)
    + [Misc](#misc)
- [OIDC](#OIDC)
    + [Audience](#audience)
    + [Sample IAM OIDC CloudFormation Template](#sample-iam-oidc-cloudformation-template)
    + [Claims and scoping permissions](#claims-and-scoping-permissions)
    + [Further info](#further-info)
- [Self-Hosted Runners](#self-hosted-runners)
    + [Proxy Configuration](#proxy-configuration)
    + [Use with the AWS CLI](#use-with-the-aws-cli)
- [Examples](#examples)
- [License Summary](#license-summary)
- [Security Disclosures](#security-disclosures)
<!-- tocstop -->

## Overview
We support five methods for fetching credentials from AWS, but we recommend that
you use GitHub's OIDC provider in conjunction with a configured AWS IAM
Identity Provider endpoint.

To do that, you would add the following step to your workflow:

```yaml
    - name: Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
        aws-region: us-east-2
```
This will cause the action to perform an [`AssumeRoleWithWebIdentity`](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html) call and
return temporary security credentials for use by other steps in your workflow. In order for
this to work, you'll need to preconfigure the IAM Identity Provider in your AWS account
(see the [OIDC](https://github.com/aws-actions/configure-aws-credentials#OIDC) section below for details).

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
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::111111111111:role/my-github-actions-role-test
        aws-region: us-east-1
    - name: Copy files to the test website with the AWS CLI
      run: |
        aws s3 sync . s3://my-s3-test-website-bucket
    - name: Configure AWS credentials from Production account
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::222222222222:role/my-github-actions-role-prod
        aws-region: us-west-2
    - name: Copy files to the production website with the AWS CLI
      run: |
        aws s3 sync . s3://my-s3-prod-website-bucket
```

See [action.yml](action.yml) for the full documentation for this action's inputs
and outputs.

### Note about GHES

Some of this documentation may be inaccurate if you are using GHES (GitHub Enterprise Servers), please take note to review the GitHub documentation when relevant.

For example, the URL that the OIDC JWT is issued from is different than the usual `token.actions.githubusercontent.com`, and will be unique to your enterprise server. As a result, you will need to configure this differently when you create the Identity Provider.

## Security recommendations

We recommend following
[Amazon IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
for the AWS credentials used in GitHub Actions workflows, including:
  * Do not store credentials in your repository's code.
  * [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege) to the credentials used in GitHub Actions
  workflows. Grant only the permissions required to perform the actions in your
  GitHub Actions workflows.
  * [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log) of the credentials used in GitHub Actions workflows.

## Using this action
There are five different supported ways to retrieve credentials:

- Using GitHub's OIDC provider (`AssumeRoleWithWebIdentity`)
- Proceeding as an IAM user (No STS call is made)
- Using access keys as action input (`AssumeRole`)
- Using a WebIdentity Token File (`AssumeRoleWithWebIdentity`)
- Using existing credentials in your runner (`AssumeRole`)

We recommend using [GitHub's OIDC provider](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) to get short-lived AWS credentials needed for your actions. See [OIDC](#OIDC) for more information on how to setup your AWS account to assume a role with OIDC. 

The following table describes which method is used based on which values are supplied to the Action:

| **Identity Used**                                               | `aws-access-key-id` | `role-to-assume` | `web-identity-token-file` | `role-chaining` | `id-token` permission
| --------------------------------------------------------------- | ------------------- | ---------------- | ------------------------- | - | - |
| [✅ Recommended] Assume Role directly using GitHub OIDC provider |                     | ✔                |                           | | ✔ |
| IAM User                                                        | ✔                   |                  |                           | | |
| Assume Role using IAM User credentials                          | ✔                   | ✔                |                           | | |
| Assume Role using WebIdentity Token File credentials            |                     | ✔                | ✔                         | | |
| Assume Role using existing credentials | | ✔ | | ✔ | |

*Note: `role-chaining` is not necessary to use existing credentials in every use case. If you're getting a "Credentials loaded by the SDK do not match" error, try enabling this prop.

### Credential Lifetime
The default session duration is **1 hour**.

If you would like to adjust this you can pass a duration to `role-duration-seconds`, but the duration cannot exceed the maximum that was defined when the IAM Role was created.

### External ID
If your role requires an external ID to assume, you can provide the external ID with the `role-external-id` input

### Session tagging and name
The default session name is "GitHubActions", and you can modify it by specifying the desired name in `role-session-name`.
The session will be tagged with the following tags: (`GITHUB_` environment variable definitions can be
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

The action will use session tagging by default during role assumption, unless you are assuming a role with a WebIdentity. 
For WebIdentity role assumption, the session tags have to be included
in the encoded WebIdentity token. This means that Tags can only be supplied by
the OIDC provider, and they cannot set during the AssumeRoleWithWebIdentity API call
within the Action. See [issue 419](https://github.com/aws-actions/configure-aws-credentials/issues/419) for more info

You can skip this session tagging by providing
`role-skip-session-tagging` as true in the action's inputs:
```yaml
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-skip-session-tagging: true
```

### Session policies

#### Inline session policies
An IAM policy in stringified JSON format that you want to use as an inline session policy.
Depending on preferences, the JSON could be written on a single line like this:
```yaml
      uses: aws-actions/configure-aws-credentials@v4
      with:
         inline-session-policy: '{"Version":"2012-10-17","Statement":[{"Sid":"Stmt1","Effect":"Allow","Action":"s3:List*","Resource":"*"}]}'
```
Or we can have a nicely formatted JSON as well:
```yaml
      uses: aws-actions/configure-aws-credentials@v4
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

#### Managed session policies
The Amazon Resource Names (ARNs) of the IAM managed policies that you want to use as managed session policies.
The policies must exist in the same account as the role. You can pass a single managed policy like this:
```yaml
      uses: aws-actions/configure-aws-credentials@v4
      with:
         managed-session-policies: arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
```
And we can pass multiple managed policies likes this:
```yaml
      uses: aws-actions/configure-aws-credentials@v4
      with:
         managed-session-policies: |
          arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
          arn:aws:iam::aws:policy/AmazonS3OutpostsReadOnlyAccess
```

### Misc

#### Adjust the retry mechanism
You can now configure retry settings for when the STS call fails. By default, we retry with exponential backoff `12` times. You can disable this behavior altogether by setting the `disable-retry` input to `true`, or you can configure the number of times it retries with the `retry-max-attempts` input.

#### Mask account ID
Your account ID is not masked by default in workflow logs since it's not considered sensitive information. However, you can set the `mask-aws-account-id` input to `true` to mask your account ID in workflow logs if desired.

#### Unset current credentials
Sometimes, existing credentials in your runner can get in the way of the intended outcome, and the recommended solution is to include another step in your workflow which unsets the environment variables set by this action. Now if you set the `unset-current-credentials` input to `true`, the workaround is made eaiser

#### Special characters in AWS_SECRET_ACCESS_KEY
Some edge cases are unable to properly parse an `AWS_SECRET_ACCESS_KEY` if it
contains special characters. For more information, please see the
[AWS CLI documentation](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-troubleshooting.html#tshoot-signature-does-not-match).
If you set the `special-characters-workaround` option, this action will
continually retry fetching credentials until we get one that does not have
special characters. This option overrides the `disable-retry` and
`retry-max-attempts` options.

## OIDC

We recommend using [GitHub's OIDC provider](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) to get short-lived AWS credentials needed for your actions. When using OIDC, this action will create a JWT unique to the workflow run, and it will use this JWT to assume the role. For this action to create the JWT, it is required for your workflow to have the `id-token: write` permission:

```yaml
    permissions:
      id-token: write
      contents: read
```

### Audience

When the JWT is created, an audience needs to be specified. By default, the audience is `sts.amazonaws.com` and this will work for most cases. Changing the default audience may be necessary when using non-default AWS partitions. You can specify the audience through the `audience` input:

```yaml
    - name: Configure AWS Credentials for China region audience
      uses: aws-actions/configure-aws-credentials@v4
      with:
        audience: sts.amazonaws.com.cn
        aws-region: us-east-3
        role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
```

### Sample IAM OIDC CloudFormation Template
To use GitHub's OIDC provider, you must first set up federation
with the provider in as an IAM IdP. The GitHub OIDC provider only needs to be
created once per account (i.e. multiple IAM Roles that can be assumed by the
GitHub's OIDC can share a single OIDC Provider).

Note that the thumbprint has been set to all F's because the thumbprint is not
used when authenticating `token.actions.githubusercontent.com`. Instead, IAM
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

### Claims and scoping permissions
To align with the Amazon IAM best practice of [granting least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege), the assume role policy document should contain a [`Condition`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition.html) that specifies a subject (`sub`) allowed to assume the role. [GitHub also recommends](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#defining-trust-conditions-on-cloud-roles-using-oidc-claims) filtering for the correct audience (`aud`). See [AWS IAM documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html#condition-keys-wif) on which claims you can filter for in your trust policies.

Without a subject (`sub`) condition, any GitHub user or repository could potentially assume the role. The subject can be scoped to a GitHub organization and repository as shown in the CloudFormation template. However, scoping it down to your org and repo may cause the role assumption to fail in some cases. See [Example subject claims](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#example-subject-claims) for specific details on what the subject value will be depending on your workflow. You can also [customize your subject claim](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#customizing-the-token-claims) if you want full control over the information you can filter for in your trust policy. If you aren't sure what your subject (`sub`) key is, you can add the [`actions-oidc-debugger`](https://github.com/github/actions-oidc-debugger) action to your workflow to see the value of the subject (`sub`) key, as well as other claims.

Additional claim conditions can be added for higher specificity as explained in the [GitHub documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect). Due to implementation details, not every OIDC claim is presently supported by IAM.

### Further info

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
uses: aws-actions/configure-aws-credentials@v4
with:
  aws-region: us-east-2
```
In this case, your runner's credentials must have permissions to call any AWS
APIs called by your Actions workflow.

Or, you can use this action to assume a role, and then use the role credentials
for all AWS API calls made by your Actions workflow:
```yaml
uses: aws-actions/configure-aws-credentials@v4
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
uses: aws-actions/configure-aws-credentials@v4
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
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-region: us-east-2
        role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
        role-session-name: MySessionName
```
In this example, the Action will load the OIDC token from the GitHub-provided environment variable and use it to assume the role `arn:aws:iam::123456789100:role/my-github-actions-role` with the session name `MySessionName`.

### AssumeRole with role previously assumed by action in same workflow
```yaml
    - name: Configure AWS Credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-region: us-east-2
        role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
        role-session-name: MySessionName
    - name: Configure other AWS Credentials
      uses: aws-actions/configure-aws-credentials@v4
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
      uses: aws-actions/configure-aws-credentials@v4
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

### Retrieving credentials from step output, AssumeRole with temporary credentials
```yaml
    - name: Configure AWS Credentials 1
      id: creds
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-region: us-east-2
        role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
        output-credentials: true
    - name: get caller identity 1
      run: |
        aws sts get-caller-identity
    - name: Configure AWS Credentials 2
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-region: us-east-2
        aws-access-key-id: ${{ steps.creds.outputs.aws-access-key-id }}
        aws-secret-access-key: ${{ steps.creds.outputs.aws-secret-access-key }}
        aws-session-token: ${{ steps.creds.outputs.aws-session-token }}
        role-to-assume: arn:aws:iam::123456789100:role/my-other-github-actions-role
    - name: get caller identity2
      run: |
        aws sts get-caller-identity
```
This example shows that you can reference the fetched credentials as outputs if `output-credentials` is set to true. This example also shows that you can use the `aws-session-token` input in a situation where session tokens are fetched and passed to this action.
 
## License Summary
This code is made available under the MIT license.

## Security Disclosures
If you would like to report a potential security issue in this project, please do not create a GitHub issue.  Instead, please follow the instructions [here](https://aws.amazon.com/security/vulnerability-reporting/) or [email AWS security directly](mailto:aws-security@amazon.com).
