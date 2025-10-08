import {
  fromContainerMetadata,
  fromEnv,
  fromInstanceMetadata,
  fromNodeProviderChain,
  fromTemporaryCredentials,
  fromWebToken,
} from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import type { NodeHttpHandler } from '@smithy/node-http-handler';

type EnvMode = { mode: 'env' };
type WebIdentityMode = { mode: 'web-identity'; webIdentityToken: string } & AssumeRoleOptions;
type StsMode = { mode: 'sts'; masterCredentials?: AwsCredentialIdentityProvider } & AssumeRoleOptions;
type ContainerMetadataMode = { mode: 'container-metadata' };
type InstanceMetadataMode = { mode: 'instance-metadata' };

type AssumeRoleOptions = {
  roleArn: string;
  roleSessionName?: string;
  durationSeconds?: number;
  policy?: string;
  policyArns?: { arn: string }[];
  region: string;
  requestHandler?: NodeHttpHandler;
};

export type CredentialsClientProps = EnvMode | WebIdentityMode | StsMode | ContainerMetadataMode | InstanceMetadataMode;

export class CredentialsClient {
  readonly DEFAULT_ROLE_DURATION = 3600;
  readonly DEFAULT_ROLE_SESSION_NAME = 'GitHubActions';
  private provider: AwsCredentialIdentityProvider;

  constructor(props: CredentialsClientProps) {
    this.provider = this.createCredentialChain(props);
  }

  private createCredentialChain(props: CredentialsClientProps): AwsCredentialIdentityProvider {
    const primaryProvider = this.getPrimaryProvider(props);
    const fallbackProvider = fromNodeProviderChain();

    return async () => {
      try {
        return await primaryProvider();
      } catch {
        return await fallbackProvider();
      }
    };
  }

  private getPrimaryProvider(props: CredentialsClientProps): AwsCredentialIdentityProvider {
    switch (props.mode) {
      case 'env':
        return fromEnv();
      case 'web-identity':
        return fromWebToken({
          clientConfig: {
            region: props.region,
            ...(props.requestHandler && { requestHandler: props.requestHandler }),
            maxAttempts: 1, // Disable built-in retry logic
          },
          roleArn: props.roleArn,
          webIdentityToken: props.webIdentityToken,
          durationSeconds: props.durationSeconds ?? this.DEFAULT_ROLE_DURATION,
          roleSessionName: props.roleSessionName ?? this.DEFAULT_ROLE_SESSION_NAME,
          ...(props.policy && { policy: props.policy }),
          ...(props.policyArns && { policyArns: props.policyArns }),
        });
      case 'sts':
        return fromTemporaryCredentials({
          params: {
            RoleArn: props.roleArn,
            DurationSeconds: props.durationSeconds ?? this.DEFAULT_ROLE_DURATION,
            RoleSessionName: props.roleSessionName ?? this.DEFAULT_ROLE_SESSION_NAME,
            ...(props.policy && { Policy: props.policy }),
            ...(props.policyArns && { PolicyArns: props.policyArns }),
          },
          clientConfig: {
            region: props.region,
            ...(props.requestHandler && { requestHandler: props.requestHandler }),
            maxAttempts: 1, // Disable built-in retry logic
          },
          ...(props.masterCredentials && { masterCredentials: props.masterCredentials }),
        });
      case 'container-metadata':
        return fromContainerMetadata();
      case 'instance-metadata':
        return fromInstanceMetadata();
    }
  }

  getCredentials(): AwsCredentialIdentityProvider {
    return this.provider;
  }
}
