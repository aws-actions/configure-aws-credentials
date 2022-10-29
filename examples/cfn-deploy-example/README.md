# cfn-deploy example

Example uses aws-action `configure-aws-credentials` with OIDC federation. Prior to using this example project, the user needs to deploy the [github-actions-oidc-federation-and-role](../federated-setup/github-actions-oidc-federation-and-role.yml) template in the AWS account they want to deploy the CloudFormation template into. Specify the GitHub Organization name, repository name, and the specific branch you want to deploy on.

Within the [github/workflows](./.github/workflows/) directory there is a [compliance.yml](./.github/workflows/compliance.yml) and a [deploy.yml](./.github/workflows/deploy.yml). The deploy.yml file leverages the aws-action `configure-aws-credentials` and accesses GitHub Action Secrets for some of the variables. The compliance.yml runs static application security testing using cfn-guard.

To use the example you will need to set the following GitHub Action Secrets:

| Secret Key | Used With | Description |
| --------- | -------- | -----------|
| AWS_ACCOUNT_ID | configure-aws-credentials | The AWS account ID |
| AWS_DEPLOY_ROLE | configure-aws-credentials | The name of the IAM role |
| VPC_ID | aws-cloudformation-github-deploy | VPC ID the EC2 Bastion is deployed to |
| SUBNET_ID | aws-cloudformation-github-deploy | Subnet ID the EC2 Bastion is deployed to |
