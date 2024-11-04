import type { CredentialsClient } from './CredentialsClient';
export interface assumeRoleParams {
    credentialsClient: CredentialsClient;
    roleToAssume: string;
    roleDuration: number;
    roleSessionName: string;
    roleSkipSessionTagging?: boolean;
    sourceAccountId?: string;
    roleExternalId?: string;
    webIdentityTokenFile?: string;
    webIdentityToken?: string;
    inlineSessionPolicy?: string;
    managedSessionPolicies?: {
        arn: string;
    }[];
}
export declare function assumeRole(params: assumeRoleParams): Promise<import("@aws-sdk/client-sts").AssumeRoleCommandOutput>;
