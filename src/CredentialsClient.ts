import { info } from '@actions/core';
import { STSClient } from '@aws-sdk/client-sts';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { errorMessage } from './helpers';

const USER_AGENT = 'configure-aws-credentials-for-github-actions';

export interface CredentialsClientProps {
  region?: string;
  proxyServer?: string;
}

export class CredentialsClient {
  public region?: string;
  private _stsClient?: STSClient;
  private readonly requestHandler?: NodeHttpHandler;

  constructor(props: CredentialsClientProps) {
    this.region = props.region;
    if (props.proxyServer) {
      info('Configuring proxy handler for STS client');
      const handler = new HttpsProxyAgent(props.proxyServer);
      this.requestHandler = new NodeHttpHandler({
        httpAgent: handler,
        httpsAgent: handler,
      });
    }
  }

  public get stsClient(): STSClient {
    if (!this._stsClient) {
      this._stsClient = new STSClient({
        region: this.region,
        customUserAgent: USER_AGENT,
        requestHandler: this.requestHandler ? this.requestHandler : undefined,
      });
    }
    return this._stsClient;
  }

  public async validateCredentials(expectedAccessKeyId?: string, roleChaining?: boolean) {
    let credentials: AwsCredentialIdentity;
    try {
      credentials = await this.loadCredentials();
      if (!credentials.accessKeyId) {
        throw new Error('Access key ID empty after loading credentials');
      }
    } catch (error) {
      throw new Error(`Credentials could not be loaded, please check your action inputs: ${errorMessage(error)}`);
    }

    if (!roleChaining) {
      const actualAccessKeyId = credentials.accessKeyId;

      if (expectedAccessKeyId && expectedAccessKeyId !== actualAccessKeyId) {
        throw new Error(
          'Unexpected failure: Credentials loaded by the SDK do not match the access key ID configured by the action',
        );
      }
    }
  }

  private async loadCredentials() {
    const client = new STSClient({
      requestHandler: this.requestHandler ? this.requestHandler : undefined,
    });
    return client.config.credentials();
  }
}
