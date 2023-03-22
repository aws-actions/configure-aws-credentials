import { STSClient } from '@aws-sdk/client-sts';
export interface CredentialsClientProps {
    region?: string;
    proxyServer?: string;
}
export declare class CredentialsClient {
    region?: string;
    private stsClient?;
    private readonly requestHandler?;
    constructor(props: CredentialsClientProps);
    getStsClient(): STSClient;
    validateCredentials(expectedAccessKeyId?: string): Promise<void>;
    private loadCredentials;
}
