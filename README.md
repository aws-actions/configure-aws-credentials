## "Configure AWS Credentials" Action For GitHub Actions

Configure AWS credential environment variables for use in other GitHub Actions.

<a href="https://github.com/aws/configure-aws-credentials-for-github-actions"><img alt="GitHub Actions status" src="https://github.com/aws/configure-aws-credentials-for-github-actions/workflows/test-local/badge.svg"></a>

This action adds configuration required by [the AWS CLI](https://aws.amazon.com/cli/) for use in subsequent actions.

## Usage

Add the following step to your workflow:

```yaml
    - name: Configure AWS Credentials
      uses: aws/configure-aws-credentials-for-github-actions
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-default-region: us-east-2
        aws-default-output: json
```

## License Summary

This code is made available under the MIT license.
