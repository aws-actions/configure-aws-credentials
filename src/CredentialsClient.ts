import { info } from '@actions/core';
import { STSClient } from '@aws-sdk/client-sts';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { ProxyAgent } from 'proxy-agent';
import { buildCustomUserAgent, errorMessage, getCallerIdentity } from './helpers';
import { ProxyResolver } from './ProxyResolver';

if (!process.env.AWS_EXECUTION_ENV) {
  process.env.AWS_EXECUTION_ENV = 'GitHubActions';
}

export interface CredentialsClientProps {
  region?: string;
  proxyServer?: string;
  noProxy?: string;
  stsEndpoint?: string;
  roleChaining: boolean;
}

export class CredentialsClient {
  public region?: string;
  private _stsClient?: STSClient;
  private readonly requestHandler?: NodeHttpHandler;
  private readonly stsEndpoint?: string;
  private roleChaining?: boolean;

  constructor(props: CredentialsClientProps) {
    if (props.region !== undefined) {
      this.region = props.region;
    }
    if (props.proxyServer) {
      info('Configuring proxy handler for STS client');
      const proxyOptions: { httpProxy: string; httpsProxy: string; noProxy?: string } = {
        httpProxy: props.proxyServer,
        httpsProxy: props.proxyServer,
      };
      if (props.noProxy !== undefined) {
        proxyOptions.noProxy = props.noProxy;
      }
      const getProxyForUrl = new ProxyResolver(proxyOptions).getProxyForUrl;
      const handler = new ProxyAgent({ getProxyForUrl });
      this.requestHandler = new NodeHttpHandler({
        httpsAgent: handler,
        httpAgent: handler,
      });
    }
    if (props.stsEndpoint) {
      this.stsEndpoint = props.stsEndpoint;
    }
    this.roleChaining = props.roleChaining;
  }

  public get stsClient(): STSClient {
    if (!this._stsClient || this.roleChaining) {
      this._stsClient = this.createStsClient();
    }
    return this._stsClient;
  }

  // Builds an STS client using the action's configured region/endpoint/proxy. When explicit credentials are provided,
  // the client uses them directly instead of the SDK default credential provider chain.
  // This matters for validateAccountId.
  private createStsClient(credentials?: AwsCredentialIdentity): STSClient {
    return new STSClient({
      customUserAgent: buildCustomUserAgent(),
      ...(this.region !== undefined && { region: this.region }),
      ...(this.stsEndpoint !== undefined && { endpoint: this.stsEndpoint }),
      ...(this.requestHandler !== undefined && { requestHandler: this.requestHandler }),
      ...(credentials !== undefined && { credentials }),
    });
  }

  // Validates that the credentials the action will hand to subsequent steps actually work, and returns the resolved
  // caller identity (account + ARN). "Work" is proven by a sts:GetCallerIdentity call, which both confirms the
  // credentials are accepted by AWS and returns the identity for later checks and outputs to use.
  public async validateCredentials(
    credentials?: AwsCredentialIdentity,
    expectedAccessKeyId?: string,
    roleChaining?: boolean,
  ): Promise<Awaited<ReturnType<typeof getCallerIdentity>>> {
    if (!credentials) {
      let resolved: AwsCredentialIdentity;
      try {
        resolved = await this.loadCredentials();
        if (!resolved.accessKeyId) {
          throw new Error('Access key ID empty after loading credentials');
        }
      } catch (error) {
        throw new Error(`Credentials could not be loaded, please check your action inputs: ${errorMessage(error)}`);
      }
      if (!roleChaining && expectedAccessKeyId && expectedAccessKeyId !== resolved.accessKeyId) {
        throw new Error(
          'Credentials loaded by the SDK do not match the expected access key ID configured by the action',
        );
      }
    }

    const client = credentials ? this.createStsClient(credentials) : this.stsClient;
    try {
      return await getCallerIdentity(client);
    } catch (error) {
      throw new Error(`Credentials could not be loaded, please check your action inputs: ${errorMessage(error)}`);
    }
  }

  private async loadCredentials() {
    const config = {} as { requestHandler?: NodeHttpHandler };
    if (this.requestHandler !== undefined) config.requestHandler = this.requestHandler;
    const client = new STSClient(config);
    return client.config.credentials();
  }
}
