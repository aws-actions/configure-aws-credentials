## Configure AWS Credentials for GitHub Actions
Configure your AWS credentials and region environment variables for use in other
GitHub Actions.

This action implements the AWS JavaScript SDK credential resolution chain
and exports session environment variables for your other Actions to use.
Environment variable exports are detected by both the AWS SDKs and the AWS CLI
for AWS API calls.

## Overview
API calls to AWS need to be signed with credential information, so when you use
one of the AWS SDKs or an AWS tool, you must provide it with AWS credentials and
and AWS region. One way to do that in GitHub Actions is to use a repository
secret with IAM credentials, but this doesn't follow [AWS security
guidelines](https://docs.aws.amazon.com/IAM/latest/UserGuide/security-creds.html)
on using long term credentials. Instead, we recommend that you use a long term
credential or JWT to fetch a temporary credential, and use that with your tools
instead. This GitHub Action facilitates just that.

AWS SDKs and Tools look for your credentials in standardized environment
variables. In essence, this Action runs through the standard [credential
resolution flow](https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html),
and at the end, exports environment variables for you to use later.

We support five methods for fetching credentials from AWS, but we recommend that
you use GitHub's OIDC provider in conjunction with a configured AWS IAM
Identity Provider endpoint.

For more information on how to do that, read on.

### Note about GHES

Some of this documentation may be inaccurate if you are using GHES (GitHub
Enterprise Server), please take note to review the GitHub documentation when
relevant.

For example, the URL that the OIDC JWT is issued from is different than the
usual `token.actions.githubusercontent.com`, and will be unique to your
enterprise server. As a result, you will need to configure this differently when
you create the Identity Provider.

We do not presently have a GHES testing environment to validate this action. If
you are running in GHES and encounter problems, please
[let us know](https://github.com/aws-actions/configure-aws-credentials/issues/new/choose).

## Security recommendations

We recommend following
[Amazon IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
for the AWS credentials used in GitHub Actions workflows, including:
  * Do not store credentials in your repository's code.
  * [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege)
  to the credentials used in GitHub Actions workflows. Grant only the
  permissions required to perform the actions in your GitHub Actions workflows.
  Do not assume overly permissive roles, even for testing.
  * [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log)
  of the credentials used in GitHub Actions workflows.
  * Use temporary credentials when possible.
  * Periodically rotate any long-term credentials you use.

## Using this action
There are five different supported ways to retrieve credentials:

- Using GitHub's OIDC provider (`AssumeRoleWithWebIdentity`)
- Proceeding as an IAM user (No STS call is made)
- Using access keys as action input (`AssumeRole`)
- Using a WebIdentity Token File (`AssumeRoleWithWebIdentity`)
- Using existing credentials in your runner (`AssumeRole`)

Because we use the AWS JavaScript SDK, we always will use the [credential
resolution flow for Node.js](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).
Depending on your inputs, the action might override parts of this flow.

We recommend using the first option above: [GitHub's OIDC provider](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services).
This method uses OIDC to get short-lived credentials needed for your actions.
See [OIDC](#OIDC) for more information on how to setup your AWS account to
assume a role with OIDC. 

The following table describes which method we'll use to get your credentials
based on which values are supplied to the Action:

| **Identity Used**                                               | `aws-access-key-id` | `role-to-assume` | `web-identity-token-file` | `role-chaining` | `id-token` permission
| --------------------------------------------------------------- | ------------------- | ---------------- | ------------------------- | - | - |
| [✅ Recommended] Assume Role directly using GitHub OIDC provider |                     | ✔                |                           | | ✔ |
| IAM User                                                        | ✔                   |                  |                           | | |
| Assume Role using IAM User credentials                          | ✔                   | ✔                |                           | | |
| Assume Role using WebIdentity Token File credentials            |                     | ✔                | ✔                         | | |
| Assume Role using existing credentials | | ✔ | | ✔ | |

*Note: `role-chaining` is not always necessary to use existing credentials.
If you're getting a "Credentials loaded by the SDK do not match" error,
try enabling this option.*

### Options
See [action.yml](./action.yml) for more detail.

|          Option           |                                            Description                                            | Required |
|---------------------------|---------------------------------------------------------------------------------------------------|----------|
| aws-region                | Which AWS region to use                                                                           |    Yes   |
| role-to-assume            | Role for which to fetch credentials. Only required for some authentication types.                 |    No    |
| aws-access-key-id         | AWS access key to use. Only required for some authentication types.                               |    No    |
| aws-secret-access-key     | AWS secret key to use. Only required for some authentication types.                               |    No    |
| aws-session-token         | AWS session token to use. Used in uncommon authentication scenarios.                              |    No    |
| role-chaining             | Use existing credentials from the environment to assume a new role.                               |    No    |
| audience                  | The JWT audience when using OIDC. Used in non-default AWS partitions, like China regions.         |    No    |
| http-proxy                | An HTTP proxy to use for API calls.                                                               |    No    |
| mask-aws-account-id       | AWS account IDs are not considered secret. Setting this will hide account IDs from output anyway. |    No    |
| role-duration-seconds     | The assumed role duration in seconds, if assuming a role. Defaults to 1 hour.                     |    No    |
| role-external-id          | The external ID of the role to assume. Only needed if your role requires it.                      |    No    |
| role-session-name         | Defaults to "GitHubActions", but may be changed if required.                                      |    No    |
| role-skip-session-tagging | Skips session tagging if set.                                                                     |    No    |
| inline-session-policy     | You may further restrict the assumed role policy by defining an inline policy here.               |    No    |
| managed-session-policies  | You may further restrict the assumed role policy by specifying a managed policy here.             |    No    |
| output-credentials        | When set, outputs fetched credentials as action step output. Defaults to false.                   |    No    |
| unset-current-credentials | When set, attempts to unset any existing credentials in your action runner.                       |    No    |
| disable-retry             | Disabled retry/backoff logic for assume role calls. By default, retries are enabled.              |    No    |
| retry-max-attempts        | Limits the number of retry attempts before giving up. Defaults to 12.                             |    No    |
| special-characters-workaround | Uncommonly, some environments cannot tolerate special characters in a secret key. This option will retry fetching credentials until the secret access key does not contain special characters. This option overrides disable-retry and retry-max-attempts. | No |

#### Credential Lifetime
The default session duration is **1 hour**.

If you would like to adjust this you can pass a duration to
`role-duration-seconds`, but the duration cannot exceed the maximum that was
defined when the IAM Role was created.

#### External ID
If your role requires an external ID to assume, you can provide the external ID
with the `role-external-id` input

#### Session tagging and name
The default session name is "GitHubActions", and you can modify it by specifying
the desired name in `role-session-name`. The session will be tagged with the
following tags: (Refer to [GitHub's documentation for `GITHUB_` environment
variable definitions](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-environment-variables#default-environment-variables))

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
[the tag requirements](https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html).
Particularly, `GITHUB_WORKFLOW` will be truncated if it's too long. If
`GITHUB_ACTOR` or `GITHUB_WORKFLOW` contain invalid characters, the characters
will be replaced with an '*'._

The action will use session tagging by default during role assumption, unless
you follow our recommendation and are assuming a role with a WebIdentity. For
WebIdentity role assumption, the session tags have to be included in the encoded
WebIdentity token. This means that tags can only be supplied by the OIDC
provider, and they cannot set during the AssumeRoleWithWebIdentity API call
within the Action. See [#419](https://github.com/aws-actions/configure-aws-credentials/issues/419)
for more information.

You can skip this session tagging by providing
`role-skip-session-tagging` as true in the action's inputs:
```yaml
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-skip-session-tagging: true
```

### Session policies
Session policies are not required, but they allow you to limit the scope of the
fetched credentials without making changes to IAM roles. You can specify inline
session policies right in your workflow file, or refer to an existing managed
session policy by its ARN.

#### Inline session policies
An IAM policy in stringified JSON format that you want to use as an inline
session policy. Depending on preferences, the JSON could be written on a single
line like this:
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
The Amazon Resource Names (ARNs) of the IAM managed policies that you want to
use as managed session policies. The policies must exist in the same account as
the role. You can pass a single managed policy like this:
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
You can now configure retry settings for when the STS call fails. By default, we
retry with exponential backoff `12` times. You can disable this behavior
altogether by setting the `disable-retry` input to `true`, or you can configure
the number of times it retries with the `retry-max-attempts` input.

#### Mask account ID
Your account ID is not masked by default in workflow logs since it's not
considered sensitive information. However, you can set the `mask-aws-account-id`
input to `true` to mask your account ID in workflow logs if desired.

#### Unset current credentials
Sometimes, existing credentials in your runner can get in the way of the
intended outcome. You can set the `unset-current-credentials` input to `true` to
work around this issue.

#### Special characters in AWS_SECRET_ACCESS_KEY
Some edge cases are unable to properly parse an `AWS_SECRET_ACCESS_KEY` if it
contains special characters. For more information, please see the
[AWS CLI documentation](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-troubleshooting.html#tshoot-signature-does-not-match).
If you set the `special-characters-workaround` option, this action will
continually retry fetching credentials until we get one that does not have
special characters. This option overrides the `disable-retry` and
`retry-max-attempts` options. We recommend that you do not enable this option
unless required, because retrying APIs infinitely until they succeed is not best
practice.

## OIDC

We recommend using [GitHub's OIDC
provider](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
to get short-lived AWS credentials needed for your actions. When using OIDC, you
configure IAM to accept JWTs from GitHub's OIDC endpoint. This action will
then create a JWT unique to the workflow run using the OIDC endpoint, and it
will use the JWT to assume the specified role with short-term credentials. 

To get this to work
1. Configure your workflow to use the `id-token: write` permission.
2. Configure your audience, if required.
3. In your AWS account, configure IAM to trust GitHub's OIDC identity provider.
4. Configure an IAM role with appropriate claim limits and permission scope.

   *Note*: Naming your role "GitHubActions" has been reported to not work. See
   [#953](https://github.com/aws-actions/configure-aws-credentials/issues/953).

5. Specify that role's ARN when setting up this action.

First, in order for this action to create the JWT, your workflow file must have
the `id-token: write` permission:

```yaml
    permissions:
      id-token: write
      contents: read
```

### OIDC Audience

When the JWT is created, an audience needs to be specified. Normally, you would
use `sts.amazonaws.com`, and this action uses this by default if you don't
specify one. This will work for most cases. Changing the default audience may
be necessary when using non-default AWS partitions, such as China regions.
You can specify the audience through the `audience` input:

```yaml
    - name: Configure AWS Credentials for China region audience
      uses: aws-actions/configure-aws-credentials@v4
      with:
        audience: sts.amazonaws.com.cn
        aws-region: us-east-3
        role-to-assume: arn:aws-cn:iam::123456789100:role/my-github-actions-role
```

### Configuring IAM to trust GitHub
To use GitHub's OIDC provider, you must first set up federation
with the provider as an IAM IdP. The GitHub OIDC provider only needs to be
created once per account (i.e. multiple IAM Roles that can be assumed by the
GitHub's OIDC can share a single OIDC Provider). Here is a sample CloudFormation
template that will configure this trust for you.

Note that the thumbprint below has been set to all F's because the thumbprint is
not used when authenticating `token.actions.githubusercontent.com`. This is a
special case used *only when GitHub's OIDC is authenticating to IAM*. IAM uses
its library of trusted CAs to authenticate. The value is still the API, so it
must be specified.

You can copy the template below, or load it from here: 
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
To align with the Amazon IAM best practice of [granting least
privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege),
the assume role policy document should contain a
[`Condition`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition.html)
that specifies a subject (`sub`) allowed to assume the role. [GitHub also
recommends](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#defining-trust-conditions-on-cloud-roles-using-oidc-claims)
filtering for the correct audience (`aud`). See [AWS IAM
documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html#condition-keys-wif)
on which claims you can filter for in your trust policies.

Without a subject (`sub`) condition, any GitHub user or repository could
potentially assume the role. The subject can be scoped to a GitHub organization
and repository as shown in the CloudFormation template. However, scoping it down
to your org and repo may cause the role assumption to fail in some cases. See
[Example subject claims](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#example-subject-claims)
for specific details on what the subject value will be depending on your
workflow. You can also [customize your subject claim](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#customizing-the-token-claims)
if you want full control over the information you can filter for in your trust
policy. If you aren't sure what your subject (`sub`) key is, you can add the
[`actions-oidc-debugger`](https://github.com/github/actions-oidc-debugger)
action to your workflow to see the value of the subject (`sub`) key, as well as
other claims.

Additional claim conditions can be added for higher specificity as explained in
the [GitHub documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect).
Due to implementation details, not every OIDC claim is presently supported by
IAM.

### Further information about OIDC

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

If need use a HTTP proxy you can set it in the action manually.

Additionally this action will always consider the `HTTP_PROXY` environment
variable.

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
In this example, the Action will load the OIDC token from the GitHub-provided
environment variable and use it to assume the role
`arn:aws:iam::123456789100:role/my-github-actions-role` with the session name
`MySessionName`.

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
In this two-step example, the first step will use OIDC to assume the role
`arn:aws:iam::123456789100:role/my-github-actions-role` just as in the prior
example. Following that, a second step will use this role to assume a different
role, `arn:aws:iam::987654321000:role/my-second-role`.

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
In this example, the secret `AWS_ROLE_TO_ASSUME` contains a string like
`arn:aws:iam::123456789100:role/my-github-actions-role`.  To assume a role in
the same account as the static credentials, you can simply specify the role
name, like `role-to-assume: my-github-actions-role`.

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
This example shows that you can reference the fetched credentials as outputs if
`output-credentials` is set to true. This example also shows that you can use
the `aws-session-token` input in a situation where session tokens are fetched
and passed to this action.
 
## License Summary
This code is made available under the MIT license.

## Security Disclosures
If you would like to report a potential security issue in this project, please
do not create a GitHub issue.  Instead, please follow the instructions
[here](https://aws.amazon.com/security/vulnerability-reporting/) or [email AWS
security directly](mailto:aws-security@amazon.com).
