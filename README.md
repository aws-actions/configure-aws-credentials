# Configure AWS Credentials

Authenticate to AWS in GitHub Actions! Works especially well with
[AWS Secrets Manager][secretsmanager].

[secretsmanager]:
  https://github.com/aws-actions/aws-secretsmanager-get-secrets

## Quick Start (OIDC, recommended)

1. Create an IAM Identity Provider in your AWS account for GitHub OIDC. (See
   [OIDC configuration](#oidc-configuration-details) below for details.)
2. Create an IAM Role in your AWS account with a trust policy that allows
    GitHub Actions to assume it. (Expand the sections below) <details>
    <summary>GitHub OIDC Trust Policy</summary>

    ```json
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Principal": {
            "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
          },
          "Action": "sts:AssumeRoleWithWebIdentity",
          "Condition": {
            "StringEquals": {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              "token.actions.githubusercontent.com:sub": "repo:<GITHUB_ORG>/<GITHUB_REPOSITORY>:ref:refs/heads/<GITHUB_BRANCH>"
            }
          }
        }
      ]
    }
    ```

    </details>

3. Attach permissions to the IAM Role that allow it to access the AWS resources
    you need.
4. Add the following to your GitHub Actions workflow: <details>
    <summary>Example Workflow</summary>

    ```yaml
    # Need ID token write permission to use OIDC
    permissions:
      id-token: write
    jobs:
      run_job_with_aws:
        runs-on: ubuntu-latest
        steps:
          - name: Configure AWS Credentials
            uses: aws-actions/configure-aws-credentials@v6.1.0
            with:
              role-to-assume: <Role ARN you created in step 2>
              aws-region: <AWS Region you want to use>
          - name: Additional steps
            run: |
              # Your commands that require AWS credentials
              aws sts get-caller-identity
    ```

    </details>

  That's it! Your GitHub Actions workflow can now access AWS resources using
    the IAM Role you created. Other authentication scenarios are also supported
    (see below).

## Security Recommendations

- Use temporary credentials when possible. OIDC is recommended because it
  provides temporary credentials and it's easy to set up.
- Do not store credentials in your repository's code. Consider using
  [git-secrets](https://github.com/awslabs/git-secrets) to prevent committing
  secrets to your repository.
- [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege)
  to your workflows. Grant only those permissions that are necessary for the
  workflow to run.
- [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log)
  of the credentials used in workflows.
- Periodically rotate any long-lived credentials that you use.
- Store sensitive information in a secure way, such as using
  [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) or
  [GitHub Secrets][gh-secrets].
- Be especially careful about running Actions in non-ephemeral environments, or
  [triggering workflows on `pull_request_target`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)
  events.

[gh-secrets]:
  https://docs.github.com/en/actions/security-guides/encrypted-secrets

## Non-OIDC Authentication Options

This action supports five different authentication methods that are configured
by specifying different inputs.

1. Use a `core.getIDToken()` call to authenticate via OIDC.
2. Re-export existing long-lived IAM credentials (access key ID and secret
   access key) as environment variables.
3. Use static credentials stored in GitHub Secrets to fetch temporary
   credentials via STS AssumeRole.
4. Use a Web Identity Token to fetch temporary credentials via STS
   AssumeRoleWithWebIdentity.
5. Use credentials stored in the Action environment to fetch temporary
   credentials via STS AssumeRole.

Because we use the AWS JavaScript SDK, we always will use the
[credential resolution flow for Node.js][cred-resolution].

[cred-resolution]:
  https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html
Depending on your inputs, the action might override parts of this flow.

<details>
<summary>Inputs and their effects on the credential resolution flow</summary>

| **Identity Used**                       | `aws-access-key-id` | `role-to-assume` | `web-identity-token-file` | `role-chaining` |
| --------------------------------------- | ------------------- | ---------------- | ------------------------- | --------------- |
| [✅ Recommended] GitHub OIDC            |                     | ✔                |                           |                 |
| IAM User (no AssumeRole)                | ✔                   |                  |                           |                 |
| AssumeRole using static IAM credentials | ✔                   | ✔                |                           |                 |
| AssumeWithWebIdentity use a token file  |                     | ✔                | ✔                         |                 |
| AssumeRole using existing credentials   |                     | ✔                |                           | ✔               |

_Note: `role-chaining` is not always necessary to use existing credentials. If
you're getting a "Credentials loaded by the SDK do not match" error, try
enabling this option._

</details>

Additionally, **`aws-region`** is always required.

_Note: If you use GitHub Enterprise Server, you may need to adjust examples
here to match your environment._

## Additional Options

### Options

The options list can be expanded below. See [action.yml](./action.yml) for more
detail.

<details>
<summary>Options list and descriptions</summary>

| Option                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Required |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| aws-region                    | Which AWS region to use                                                                                                                                                                                                                                                                                                                                                                                                                                          | Yes      |
| aws-profile                   | Name of the AWS profile to configure. When provided, credentials are written to `~/.aws/credentials` and `~/.aws/config` files. This enables configuring multiple profiles in a single workflow. Name cannot contain whitespace, square brackets, or slashes. When set, credentials will not be exported as environment variables unless `output-env-credentials` is manually set to true.                                                                       | No       |
| overwrite-aws-profile         | Overwrite the given AWS profile if it already exists. When set to false or not set, an error will be thrown if the profile already exists.                                                                                                                                                                                                                                                                                                                       | No       |
| role-to-assume                | Role for which to fetch credentials. Only required for some authentication types.                                                                                                                                                                                                                                                                                                                                                                                | No       |
| aws-access-key-id             | AWS access key to use. Only required for some authentication types.                                                                                                                                                                                                                                                                                                                                                                                              | No       |
| aws-secret-access-key         | AWS secret key to use. Only required for some authentication types.                                                                                                                                                                                                                                                                                                                                                                                              | No       |
| aws-session-token             | AWS session token to use. Used in uncommon authentication scenarios.                                                                                                                                                                                                                                                                                                                                                                                             | No       |
| role-chaining                 | Use existing credentials from the environment to assume a new role.                                                                                                                                                                                                                                                                                                                                                                                              | No       |
| audience                      | The JWT audience when using OIDC. Used in non-default AWS partitions, like China regions.                                                                                                                                                                                                                                                                                                                                                                        | No       |
| http-proxy                    | An HTTP proxy to use for API calls.                                                                                                                                                                                                                                                                                                                                                                                                                              | No       |
| mask-aws-account-id           | AWS account IDs are not considered secret. Setting this will hide account IDs from output anyway.                                                                                                                                                                                                                                                                                                                                                                | No       |
| role-duration-seconds         | The assumed role duration in seconds, if assuming a role. Defaults to 1 hour (3600 seconds). Acceptable values range from 15 minutes (900 seconds) to 12 hours (43200 seconds).                                                                                                                                                                                                                                                                                  | No       |
| role-external-id              | The external ID of the role to assume. Only needed if your role requires it.                                                                                                                                                                                                                                                                                                                                                                                     | No       |
| role-session-name             | Defaults to "GitHubActions", but may be changed if required.                                                                                                                                                                                                                                                                                                                                                                                                     | No       |
| role-skip-session-tagging     | Skips session tagging if set.                                                                                                                                                                                                                                                                                                                                                                                                                                    | No       |
| transitive-tag-keys           | Define a list of transitive tag keys to pass when assuming a role.                                                                                                                                                                                                                                                                                                                                                                                               | No       |
| inline-session-policy         | You may further restrict the assumed role policy by defining an inline policy here.                                                                                                                                                                                                                                                                                                                                                                              | No       |
| managed-session-policies      | You may further restrict the assumed role policy by specifying a managed policy here.                                                                                                                                                                                                                                                                                                                                                                            | No       |
| output-credentials            | When set, outputs fetched credentials as action step output. (Outputs aws-access-key-id, aws-secret-access-key, aws-session-token, aws-account-id, authenticated-arn, and aws-expiration). Defaults to false.                                                                                                                                                                                                                                                    | No       |
| output-env-credentials        | When set, outputs fetched credentials as environment variables (AWS_REGION, AWS_DEFAULT_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, and AWS_PROFILE (if profile option is used)). Defaults to true when `aws-profile` is not set, and false when `aws-profile` is set. Set to false to avoid setting env variables. (NOTE: Setting to false will prevent aws-account-id from being exported as a step output).                          | No       |
| unset-current-credentials     | When set, attempts to unset any existing credentials in your action runner.                                                                                                                                                                                                                                                                                                                                                                                      | No       |
| disable-retry                 | Disabled retry/backoff logic for assume role calls. By default, retries are enabled.                                                                                                                                                                                                                                                                                                                                                                             | No       |
| retry-max-attempts            | Limits the number of retry attempts before giving up. Defaults to 12.                                                                                                                                                                                                                                                                                                                                                                                            | No       |
| special-characters-workaround | Uncommonly, some environments cannot tolerate special characters in a secret key. This option will retry fetching credentials until the secret access key does not contain special characters. This option overrides disable-retry and retry-max-attempts.                                                                                                                                                                                                       | No       |
| use-existing-credentials      | When set, the action will check if existing credentials are valid and exit if they are. Defaults to false.                                                                                                                                                                                                                                                                                                                                                       | No       |
| allowed-account-ids           | A comma-delimited list of expected AWS account IDs. The action will fail if we receive credentials for the wrong account.                                                                                                                                                                                                                                                                                                                                        | No       |
| force-skip-oidc               | When set, the action will skip using GitHub OIDC provider even if the id-token permission is set.                                                                                                                                                                                                                                                                                                                                                                | No       |
| action-timeout-s              | Global timeout for the action in seconds. If set to a value greater than 0, the action will fail if it takes longer than this time to complete.                                                                                                                                                                                                                                                                                                                  | No       |

</details>

#### Adjust the retry mechanism

You can configure retry settings for if the STS call fails. By default, we retry
with exponential backoff `12` times. You can disable this behavior altogether by
setting the `disable-retry` input to `true`, or you can configure the number of
times it retries with the `retry-max-attempts` input.

#### Mask account ID

Your account ID is not masked by default in workflow logs. You can set the
`mask-aws-account-id` input to `true` to mask your account ID in workflow logs
if desired.

#### Unset current credentials

Sometimes, existing credentials in your runner can get in the way of the
intended outcome. You can set the `unset-current-credentials` input to `true` to
work around this issue.

#### Configure named AWS profiles

By default, this action exports credentials as environment variables
(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, etc.). However, you can use the
`aws-profile` input to configure named AWS profiles. When `aws-profile` is
provided, credentials are written to `~/.aws/credentials` and `~/.aws/config`
files (which are created if they don't already exist). The default locations of
these files will be overridden if the `AWS_SHARED_CREDENTIALS_FILE` and
`AWS_CONFIG_FILE` environment variables are present.

Profile names may not contain whitespace, square brackets, or forward or
backslashes.

Writing to a profile will prevent credentials being written to the environment
by default. Use `output-env-credentials: true` if you would like the
credentials to also be exported as environment variables.

By default, the action will not overwrite existing profiles. If you would like
to overwrite a profile, set the `overwrite-aws-profile` input to `true`.

_Note: When writing profiles, the action will preserve existing profile sections
in the credentials and config files. However, comments in these files will not
be preserved._

_Caution: Writing to the AWS configuration file means that credentials will
persist in the execution environment even after the action cleanup step. Use
extreme care to ensure that this is safe in your environment and you do not leak
valid credentials unintentionally. Writing to configuration files is intended
for unusual authentication scenarios._

For using profiles with static IAM User Credentials or when using one
role to assume another, role chaining is needed:

<details>

If using static credentials, it's necessary to set `role-chaining: true` and
specify the profile name as an environment variable in the job step:

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v6.1.0
  with: 
    aws-region: us-east-1
    role-to-assume: arn:aws:iam::123456789100:role/my-role
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-profile: MyProfile1
    role-chaining: true
  env:
    AWS_PROFILE: MyProfile1
```

If you are using one role to assume another while using profiles, the
subsequent steps must set `role-chaining: true` and specify the prior profile's
name as step environment variables:

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v6.1.0
  with:
    aws-region: us-east-1
    role-to-assume: arn:aws:iam::123456789100:role/my-first-role
    aws-profile: firstRoleInChain

- name: assume second role
  uses: aws-actions/configure-aws-credentials@v6.1.0
  with:
    aws-region: us-east-2
    role-to-assume: arn:aws:iam::987654321000:role/my-second-role
    role-chaining: true
    aws-profile: secondRoleInChain
  env:
    AWS_PROFILE: firstRoleInChain
```

</details>

See the [Examples](#examples) section for more usage examples.

#### Skip the cleanup

By default, this action runs a post-job cleanup step that removes credentials
from the environment. To skip this step, set the `AWS_SKIP_CLEANUP_STEP`
environment variable to `true`:

```yaml
    env:
      AWS_SKIP_CLEANUP_STEP: 'true'
```

#### Use an HTTP proxy

If need use an HTTP proxy you can set it in the action manually. Additionally
this action will always consider the `HTTP_PROXY` environment variable.

<details>
<summary>Proxy configuration</summary>

Manually configured proxy:

```yaml
uses: aws-actions/configure-aws-credentials@v6.1.0
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

</details>

#### Special characters in AWS_SECRET_ACCESS_KEY

Some edge cases are unable to properly parse an `AWS_SECRET_ACCESS_KEY` if it
contains special characters. For more information, please see the
[AWS CLI documentation][aws-cli-troubleshooting].

[aws-cli-troubleshooting]:
  https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-troubleshooting.html#tshoot-signature-does-not-match
If you set the `special-characters-workaround` option, this action will
continually retry fetching credentials until we get one that does not have
special characters. This option overrides the `disable-retry` and
`retry-max-attempts` options. We recommend that you do not enable this option
unless required, because retrying APIs infinitely until they succeed is not best
practice.

## Session Naming and Policies

The default session name is "GitHubActions", and you can modify it by specifying
the desired name in `role-session-name`.

_Note: you might find it helpful to set the `role-session-name` to
`${{ github.run_id }}` so as to clarify in audit logs which AWS actions were
performed by which workflow run._

The session will be tagged with the following tags: (Refer to
[GitHub's documentation for `GITHUB_` environment variable
definitions][gh-env-vars])

[gh-env-vars]:
  https://docs.github.com/en/actions/reference/workflows-and-actions/variables#default-environment-variables

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
will be replaced with an '\*'._

The action will use session tagging by default unless you are using OIDC.

To [forward session tags to subsequent sessions in a role
chain][session-tag-chaining], you can use

[session-tag-chaining]: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_session-tags.html#id_session-tags_role-chaining

the `transitive-tag-keys` input to specify the keys of the tags to be passed.

_Note that all subsequent roles in the chain must have
`role-skip-session-tagging` set to `true`_

```yaml
uses: aws-actions/configure-aws-credentials@v6
with:
  transitive-tag-keys: |
    Repository
    Workflow
    Action
    Actor
```

### Session policies

Session policies are not required, but they allow you to limit the scope of the
fetched credentials without making changes to IAM roles. You can specify inline
session policies right in your workflow file, or refer to an existing managed
session policy by its ARN.

#### Inline session policies

An IAM policy in stringified JSON format that you want to use as an inline
session policy. Depending on preferences, the JSON could be written on a single
line.

<details>
<summary>Inline session policy examples</summary>

```yaml
uses: aws-actions/configure-aws-credentials@v6.1.0
with:
  inline-session-policy: '{"Version":"2012-10-17","Statement":[{"Sid":"Stmt1","Effect":"Allow","Action":"s3:List*","Resource":"*"}]}'
```

Or we can have a nicely formatted JSON as well:

```yaml
uses: aws-actions/configure-aws-credentials@v6.1.0
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

</details>

#### Managed session policies

The Amazon Resource Names (ARNs) of the IAM managed policies that you want to
use as managed session policies. The policies must exist in the same account as
the role.

<details>
<summary>Managed session policy examples</summary>

```yaml
uses: aws-actions/configure-aws-credentials@v6.1.0
with:
  managed-session-policies: arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
```

And we can pass multiple managed policies likes this:

```yaml
uses: aws-actions/configure-aws-credentials@v6.1.0
with:
  managed-session-policies: |
    arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess
    arn:aws:iam::aws:policy/AmazonS3OutpostsReadOnlyAccess
```

</details>

## OIDC Configuration Details

We recommend using
[GitHub's OIDC provider](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
to get short-lived AWS credentials needed for your actions. When using OIDC, you
configure IAM to accept JWTs from GitHub's OIDC endpoint. This action will then
create a JWT unique to the workflow run using the OIDC endpoint, and it will use
the JWT to assume the specified role with short-term credentials.

To get this to work

1. Configure your workflow to use the `id-token: write` permission.
2. Configure your audience, if required.
3. In your AWS account, configure IAM to trust GitHub's OIDC identity provider.
4. Configure an IAM role with appropriate claim limits and permission scope.

   _Note_: Naming your role "GitHubActions" has been reported to not work. See
   [#953](https://github.com/aws-actions/configure-aws-credentials/issues/953).

5. Specify that role's ARN when setting up this action.

### OIDC Audience

When the JWT is created, an audience needs to be specified. Normally, you would
use `sts.amazonaws.com`, and this action uses this by default if you don't
specify one. This will work for most cases. Changing the default audience may be
necessary when using non-default AWS partitions, such as China regions. You can
specify the audience through the `audience` input:

```yaml
- name: Configure AWS Credentials for China region audience
  uses: aws-actions/configure-aws-credentials@v6.1.0
  with:
    audience: sts.amazonaws.com.cn
    aws-region: cn-northwest-1
    role-to-assume: arn:aws-cn:iam::123456789100:role/my-github-actions-role
```

### Configuring IAM to trust GitHub

To use GitHub's OIDC provider, you must first set up federation in your AWS
account. This involves creating an IAM Identity Provider that trusts GitHub's
OIDC endpoint. You can create an IAM Identity Provider in the AWS Management
Console by specifying the following details:

- **Provider Type**: OIDC
- **Provider URL**: `https://token.actions.githubusercontent.com`
- **Audience**: `sts.amazonaws.com` (or your custom audience if you specified
  one in the `audience` input)

Prior versions of this documentation gave instructions for specifying the
certificate fingerprint, but this is no longer necessary. The thumbprint, if
specified, will be ignored.

You can also create the IAM Identity Provider using the AWS CLI:

```bash
aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com
```

### Claims and scoping permissions

To align with the Amazon IAM best practice of
[granting least privilege][least-privilege],

[least-privilege]:
  https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege
the assume role policy document should contain a
[`Condition`](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition.html)
that specifies a subject (`sub`) allowed to assume the role.
[GitHub also recommends](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#defining-trust-conditions-on-cloud-roles-using-oidc-claims)
filtering for the correct audience (`aud`). See
[AWS IAM documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_iam-condition-keys.html#condition-keys-wif)
on which claims you can filter for in your trust policies.

Without a subject (`sub`) condition, any GitHub user or repository could
potentially assume the role. The subject can be scoped to a GitHub organization
and repository as shown in the CloudFormation template. However, scoping it down
to your org and repo may cause the role assumption to fail in some cases. See
[Example subject claims](https://docs.github.com/en/actions/reference/security/oidc#example-subject-claims)
for specific details on what the subject value will be depending on your
workflow. You can also
[customize your subject claim](https://docs.github.com/en/actions/reference/security/oidc#customizing-the-token-claims)
if you want full control over the information you can filter for in your trust
policy. If you aren't sure what your subject (`sub`) key is, you can add the
[`actions-oidc-debugger`](https://github.com/github/actions-oidc-debugger)
action to your workflow to see the value of the subject (`sub`) key, as well as
other claims.

Additional claim conditions can be added for higher specificity as explained in
the
[GitHub documentation][gh-oidc-hardening].

[gh-oidc-hardening]:
  https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect
Due to implementation details, not every OIDC claim is presently supported by
IAM.

### Further information about OIDC

For further information on OIDC and GitHub Actions, please see:

- [AWS docs: Creating OpenID Connect (OIDC) identity providers](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [AWS docs: IAM JSON policy elements: Condition](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_condition.html)
- [GitHub docs: About security hardening with OpenID Connect](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [GitHub docs: Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [GitHub changelog: GitHub Actions: Secure cloud deployments with OpenID Connect](https://github.blog/changelog/2021-10-27-github-actions-secure-cloud-deployments-with-openid-connect/)

## Examples

### AssumeRoleWithWebIdentity

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v6.1.0
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
  uses: aws-actions/configure-aws-credentials@v6.1.0
  with:
    aws-region: us-east-2
    role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
    role-session-name: MySessionName
- name: Configure other AWS Credentials
  uses: aws-actions/configure-aws-credentials@v6.1.0
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

Note that the trust relationship/trust policy of the second role must grant the
permissions `sts:AssumeRole` and `sts:TagSession` to the first role. (Or,
alternatively, the `TagSession` permission can be omitted if you are using the
`role-skip-session-tagging: true` flag for the second step.)

### AssumeRole with static IAM credentials in repository secrets

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v6.1.0
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
`arn:aws:iam::123456789100:role/my-github-actions-role`. To assume a role in the
same account as the static credentials, you can simply specify the role name,
like `role-to-assume: my-github-actions-role`.

### Retrieving credentials from step output

```yaml
- name: Configure AWS Credentials 1
  id: creds
  uses: aws-actions/configure-aws-credentials@v6.1.0
  with:
    aws-region: us-east-2
    role-to-assume: arn:aws:iam::123456789100:role/my-github-actions-role
    output-credentials: true
- name: get caller identity 1
  run: |
    aws sts get-caller-identity
- name: Configure AWS Credentials 2
  uses: aws-actions/configure-aws-credentials@v6.1.0
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

### Configure multiple AWS profiles in a single workflow

```yaml
- name: Configure AWS Credentials for Dev
  uses: aws-actions/configure-aws-credentials@v6.1.0
  with:
    aws-region: us-east-1
    role-to-assume: arn:aws:iam::111111111111:role/dev-role
    aws-profile: dev

- name: Configure AWS Credentials for Prod
  uses: aws-actions/configure-aws-credentials@v6.1.0
  with:
    aws-region: us-west-2
    role-to-assume: arn:aws:iam::222222222222:role/prod-role
    aws-profile: prod

- name: Use multiple profiles
  run: |
    # Check caller identity for dev account
    aws sts get-caller-identity --profile dev

    # Check caller identity for prod account
    aws sts get-caller-identity --profile prod

    # Deploy to dev using CDK
    cdk deploy --profile dev
```

This example shows how to configure multiple named AWS profiles in a single
workflow. When using the `aws-profile` input, credentials are written to
`~/.aws/credentials` and `~/.aws/config` files, allowing you to reference
different profiles using the `--profile` flag with AWS CLI, SDKs, CDK, and
other tools.

Each profile is independent and can authenticate to different AWS accounts or
use different roles. This is particularly useful for multi-account deployments
or when you need to interact with multiple AWS environments in a single job.

## Versioning

Starting with version 5.0.0, this action uses semantic-style release tags and
[immutable releases][immutable-releases].

[immutable-releases]:
  https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases
A floating version tag (vN) is also provided for convenience: this tag will move
to the latest major version (vN -> vN.2.1, vM -> vM.0.0, etc.).

## License

This code is made available under the MIT license.

## Security Disclosures

If you would like to report a potential security issue in this project, please
do not create a GitHub issue. Instead, please follow the instructions
[on the vulnerability reporting page](https://aws.amazon.com/security/vulnerability-reporting/)
or [email AWS security](mailto:aws-security@amazon.com) directly.
