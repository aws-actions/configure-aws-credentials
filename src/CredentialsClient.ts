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
      this._stsClient = new STSClient({
        customUserAgent: buildCustomUserAgent(),
        ...(this.region !== undefined && { region: this.region }),
        ...(this.stsEndpoint !== undefined && { endpoint: this.stsEndpoint }),
        ...(this.requestHandler !== undefined && { requestHandler: this.requestHandler }),
      });
    }
    return this._stsClient;
  }

  public async validateCredentials(
    expectedAccessKeyId?: string,
    roleChaining?: boolean,
    expectedAccountIds?: string[],
  ) {
    let credentials: AwsCredentialIdentity;
    try {
      credentials = await this.loadCredentials();
      if (!credentials.accessKeyId) {
        throw new Error('Access key ID empty after loading credentials');
      }
    } catch (error) {
      throw new Error(`Credentials could not be loaded, please check your action inputs: ${errorMessage(error)}`);
    }
    if (expectedAccountIds && expectedAccountIds.length > 0 && expectedAccountIds[0] !== '') {
      let callerIdentity: Awaited<ReturnType<typeof getCallerIdentity>>;
      try {
        callerIdentity = await getCallerIdentity(this.stsClient);
      } catch (error) {
        throw new Error(`Could not validate account ID of credentials: ${errorMessage(error)}`);
      }
      if (!callerIdentity.Account || !expectedAccountIds.includes(callerIdentity.Account)) {
        throw new Error(
          `The account ID of the provided credentials (${
            callerIdentity.Account ?? 'unknown'
          }) does not match any of the expected account IDs: ${expectedAccountIds.join(', ')}`,
        );
      }
    }

    if (!roleChaining) {
      const actualAccessKeyId = credentials.accessKeyId;
      if (expectedAccessKeyId && expectedAccessKeyId !== actualAccessKeyId) {
        throw new Error(
          'Credentials loaded by the SDK do not match the expected access key ID configured by the action',
        );
      }
    }
  }

  private async loadCredentials() {
    const config = {} as { requestHandler?: NodeHttpHandler };
    if (this.requestHandler !== undefined) config.requestHandler = this.requestHandler;
    const client = new STSClient(config);
    return client.config.credentials();
  }
}
