export interface assumeRoleParams {
    region: string;
    roleToAssume: string;
    roleDurationSeconds: number;
    roleSessionName: string;
    roleSkipSessionTagging?: boolean;
    sourceAccountId?: string;
    roleExternalId?: string;
    webIdentityTokenFile?: string;
    webIdentityToken?: string;
}
export declare function assumeRole(params: assumeRoleParams): Promise<import("@aws-sdk/client-sts").AssumeRoleWithWebIdentityCommandOutput>;
