import type * as core from '@actions/core';
declare const _default: {
    readonly outputs: {
        STS_CREDENTIALS: {
            Credentials: {
                AccessKeyId: string;
                SecretAccessKey: string;
                SessionToken: string;
                Expiration: Date;
            };
            AssumedRoleUser: {
                Arn: string;
                AssumedRoleId: string;
            };
        };
        GET_CALLER_IDENTITY: {
            Account: string;
            Arn: string;
        };
        FAKE_STS_ACCESS_KEY_ID: string;
        FAKE_STS_SECRET_ACCESS_KEY: string;
        FAKE_STS_SESSION_TOKEN: string;
        ODD_CHARACTER_CREDENTIALS: {
            Credentials: {
                AccessKeyId: string;
                SecretAccessKey: string;
                SessionToken: string;
                Expiration: Date;
            };
            AssumedRoleUser: {
                Arn: string;
                AssumedRoleId: string;
            };
        };
    };
    readonly envs: {
        GITHUB_REPOSITORY: string;
        GITHUB_WORKFLOW: string;
        GITHUB_ACTION: string;
        GITHUB_ACTOR: string;
        GITHUB_SHA: string;
        GITHUB_WORKSPACE: string;
        GITHUB_ACTIONS: string;
    };
    readonly GH_OIDC_INPUTS: {
        'role-to-assume': string;
        'aws-region': string;
        'special-characters-workaround': string;
    };
    readonly IAM_USER_INPUTS: {
        'aws-access-key-id': string;
        'aws-secret-access-key': string;
        'aws-region': string;
    };
    readonly IAM_ASSUMEROLE_INPUTS: {
        'aws-access-key-id': string;
        'aws-secret-access-key': string;
        'role-to-assume': string;
        'aws-region': string;
    };
    readonly WEBIDENTITY_TOKEN_FILE_INPUTS: {
        'web-identity-token-file': string;
        'role-to-assume': string;
        'aws-region': string;
    };
    readonly EXISTING_ROLE_INPUTS: {
        'role-to-assume': string;
        'role-chaining': string;
        'aws-region': string;
    };
    readonly getInput: (fakeEnv: Record<string, string>) => (name: string, options?: core.InputOptions) => string;
    readonly getMultilineInput: (fakeEnv: Record<string, string[]>) => (name: string, options?: core.InputOptions) => string[];
};
export default _default;
