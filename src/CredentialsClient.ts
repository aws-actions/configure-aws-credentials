import { STSClient } from '@aws-sdk/client-sts';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import proxy from 'https-proxy-agent';
import { errorMessage } from './helpers';

const USER_AGENT = 'configure-aws-credentials-for-github-actions';

export interface CredentialsClientProps {
  region?: string;
  proxyServer?: string;
}

export class CredentialsClient {
  public region?: string;
  private stsClient?: STSClient;
  private readonly requestHandler?: NodeHttpHandler;

  constructor(props: CredentialsClientProps) {
    if (props.region) {
      this.region = props.region;
    }
    if (props.proxyServer) {
      const handler = proxy(props.proxyServer);
      this.requestHandler = new NodeHttpHandler({
        httpAgent: handler,
        httpsAgent: handler,
      });
    }
  }

  public getStsClient(): STSClient {
    if (!this.stsClient) {
      this.stsClient = new STSClient({
        region: this.region ? this.region : undefined,
        customUserAgent: USER_AGENT,
        requestHandler: this.requestHandler ? this.requestHandler : undefined,
        useGlobalEndpoint: this.region ? false : true,
      });
    }
    return this.stsClient;
  }

  public async validateCredentials(expectedAccessKeyId?: string) {
    let credentials;
    try {
      credentials = await this.loadCredentials();
      if (!credentials.accessKeyId) {
        throw new Error('Access key ID empty after loading credentials');
      }
    } catch (error) {
      throw new Error(`Credentials could not be loaded, please check your action inputs: ${errorMessage(error)}`);
    }

    const actualAccessKeyId = credentials.accessKeyId;

    if (expectedAccessKeyId && expectedAccessKeyId !== actualAccessKeyId) {
      throw new Error(
        'Unexpected failure: Credentials loaded by the SDK do not match the access key ID configured by the action'
      );
    }
  }

  private async loadCredentials() {
    const client = new STSClient({
      requestHandler: this.requestHandler ? this.requestHandler : undefined,
    });
    return client.config.credentials();
  }
}
