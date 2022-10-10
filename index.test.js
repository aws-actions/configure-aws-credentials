const core = require('@actions/core');
const assert = require('assert');
const aws = require('aws-sdk');
const { run, withSleep, reset }  = require('./index.js');

jest.mock('@actions/core');

const FAKE_ACCESS_KEY_ID = 'MY-AWS-ACCESS-KEY-ID';
const FAKE_SECRET_ACCESS_KEY = 'MY-AWS-SECRET-ACCESS-KEY';
const FAKE_SESSION_TOKEN = 'MY-AWS-SESSION-TOKEN';
const FAKE_STS_ACCESS_KEY_ID = 'STS-AWS-ACCESS-KEY-ID';
const FAKE_STS_SECRET_ACCESS_KEY = 'STS-AWS-SECRET-ACCESS-KEY';
const FAKE_STS_SESSION_TOKEN = 'STS-AWS-SESSION-TOKEN';
const FAKE_REGION = 'fake-region-1';
const FAKE_ACCOUNT_ID = '123456789012';
const FAKE_ROLE_ACCOUNT_ID = '111111111111';
const ROLE_NAME = 'MY-ROLE';
const ROLE_ARN = 'arn:aws:iam::111111111111:role/MY-ROLE';
const ENVIRONMENT_VARIABLE_OVERRIDES = {
    SHOW_STACK_TRACE: 'true',
    GITHUB_REPOSITORY: 'MY-REPOSITORY-NAME',
    GITHUB_WORKFLOW: 'MY-WORKFLOW-ID',
    GITHUB_ACTION: 'MY-ACTION-NAME',
    GITHUB_ACTOR: 'MY-USERNAME[bot]',
    GITHUB_SHA: 'MY-COMMIT-ID',
    GITHUB_REF: 'MY-BRANCH',
    GITHUB_WORKSPACE: '/home/github'
};
const GITHUB_ACTOR_SANITIZED = 'MY-USERNAME_bot_'

function mockGetInput(requestResponse) {
    return function (name, options) { // eslint-disable-line no-unused-vars
        return requestResponse[name]
    }
}
const CREDS_INPUTS = {
    'aws-access-key-id': FAKE_ACCESS_KEY_ID,
    'aws-secret-access-key': FAKE_SECRET_ACCESS_KEY
};
const DEFAULT_INPUTS = {
    ...CREDS_INPUTS,
    'aws-session-token': FAKE_SESSION_TOKEN,
    'aws-region': FAKE_REGION,
    'mask-aws-account-id': 'TRUE'
};
const ASSUME_ROLE_INPUTS = {...CREDS_INPUTS, 'role-to-assume': ROLE_ARN, 'aws-region': FAKE_REGION};

const mockStsCallerIdentity = jest.fn();
const mockStsAssumeRole = jest.fn();
const mockStsAssumeRoleWithWebIdentity = jest.fn();

jest.mock('aws-sdk', () => {
    return {
        config: {
            getCredentials: jest.fn()
        },
        STS: jest.fn(() => ({
            getCallerIdentity: mockStsCallerIdentity,
            assumeRole: mockStsAssumeRole,
            assumeRoleWithWebIdentity: mockStsAssumeRoleWithWebIdentity
        }))
    };
});

jest.mock('fs', () => {
    return {
        promises: {
            readFile: jest.fn(() => Promise.resolve('testpayload')),
        },
        existsSync: jest.fn(() => true)
    };
});


jest.mock('axios', () => ({
  get: jest.fn(() => Promise.resolve({ data: { value: "testtoken" }})),
}));

describe('Configure AWS Credentials', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {...OLD_ENV, ...ENVIRONMENT_VARIABLE_OVERRIDES};

        jest.clearAllMocks();

        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(DEFAULT_INPUTS));

        core.getIDToken = jest
            .fn()
            .mockImplementation(() => {
                return "testtoken"
            });

        mockStsCallerIdentity.mockReset();
        mockStsCallerIdentity
            .mockReturnValueOnce({
                promise() {
                   return Promise.resolve({ Account: FAKE_ACCOUNT_ID });
                }
            })
            .mockReturnValueOnce({
                promise() {
                   return Promise.resolve({ Account: FAKE_ROLE_ACCOUNT_ID });
                }
            });

        aws.config.getCredentials.mockReset();
        aws.config.getCredentials
            .mockImplementationOnce(callback => {
                if (!aws.config.credentials) {
                    aws.config.credentials = {
                        accessKeyId: FAKE_ACCESS_KEY_ID,
                        secretAccessKey: FAKE_SECRET_ACCESS_KEY
                    }
                }
                callback(null);
            })
            .mockImplementationOnce(callback => {
                if (!aws.config.credentials) {
                    aws.config.credentials = {
                        accessKeyId: FAKE_STS_ACCESS_KEY_ID,
                        secretAccessKey: FAKE_STS_SECRET_ACCESS_KEY
                    }
                }
                callback(null);
            });

        mockStsAssumeRole.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Credentials: {
                            AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
                            SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
                            SessionToken: FAKE_STS_SESSION_TOKEN
                        }
                    });
                }
            }
        });

        mockStsAssumeRoleWithWebIdentity.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        Credentials: {
                            AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
                            SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
                            SessionToken: FAKE_STS_SESSION_TOKEN
                        }
                    });
                }
            }
        });

        withSleep(() => {
            return Promise.resolve();
        });
    });

    afterEach(() => {
        process.env = OLD_ENV;
        reset();
    });

    test('exports env vars', async () => {
        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledTimes(0);
        expect(core.exportVariable).toHaveBeenCalledTimes(5);
        expect(core.setSecret).toHaveBeenCalledTimes(4);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', FAKE_ACCESS_KEY_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_SECRET_ACCESS_KEY);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_SECRET_ACCESS_KEY);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', FAKE_SESSION_TOKEN);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_SESSION_TOKEN);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', FAKE_REGION);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', FAKE_REGION);
        expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', FAKE_ACCOUNT_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCOUNT_ID);
    });

    test('action fails when github env vars are not set', async () => {
        process.env.SHOW_STACK_TRACE = 'false';
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));
        delete process.env.GITHUB_SHA;

        await run();
        expect(core.setFailed).toHaveBeenCalledWith('Missing required environment value. Are you running in GitHub Actions?');
    });

    test('action does not require GITHUB_REF env var', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));
        delete process.env.GITHUB_REF;

        await run();
    });

    test('hosted runners can pull creds from a self-hosted environment', async () => {
        const mockInputs = {'aws-region': FAKE_REGION};
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(mockInputs));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledTimes(0);
        expect(core.exportVariable).toHaveBeenCalledTimes(2);
        expect(core.setSecret).toHaveBeenCalledTimes(1);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', FAKE_REGION);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', FAKE_REGION);
        expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', FAKE_ACCOUNT_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCOUNT_ID);
    });

    test('action with no accessible credentials fails', async () => {
        process.env.SHOW_STACK_TRACE = 'false';
        const mockInputs = {'aws-region': FAKE_REGION};
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(mockInputs));
        aws.config.getCredentials.mockReset();
        aws.config.getCredentials.mockImplementation(callback => {
            callback(new Error('No credentials to load'));
        });

        await run();

        expect(core.setFailed).toHaveBeenCalledWith("Credentials could not be loaded, please check your action inputs: No credentials to load");
    });

    test('action with empty credentials fails', async () => {
        process.env.SHOW_STACK_TRACE = 'false';
        const mockInputs = {'aws-region': FAKE_REGION};
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(mockInputs));
        aws.config.getCredentials.mockReset();
        aws.config.getCredentials.mockImplementation(callback => {
            aws.config.credentials = {
                accessKeyId: ''
            }
            callback(null);
        });

        await run();

        expect(core.setFailed).toHaveBeenCalledWith("Credentials could not be loaded, please check your action inputs: Access key ID empty after loading credentials");
    });

    test('action fails when credentials are not set in the SDK correctly', async () => {
        process.env.SHOW_STACK_TRACE = 'false';
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));
        aws.config.getCredentials.mockReset();
        aws.config.getCredentials.mockImplementation(callback => {
            aws.config.credentials = {
                accessKeyId: FAKE_ACCESS_KEY_ID
            }
            callback(null);
        });

        await run();

        expect(core.setFailed).toHaveBeenCalledWith("Unexpected failure: Credentials loaded by the SDK do not match the access key ID configured by the action");
    });

    test('session token is optional', async () => {
        const mockInputs = {...CREDS_INPUTS, 'aws-region': 'eu-west-1'};
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(mockInputs));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledTimes(0);
        expect(core.exportVariable).toHaveBeenCalledTimes(4);
        expect(core.setSecret).toHaveBeenCalledTimes(3);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', FAKE_ACCESS_KEY_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_SECRET_ACCESS_KEY);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_SECRET_ACCESS_KEY);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'eu-west-1');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'eu-west-1');
        expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', FAKE_ACCOUNT_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCOUNT_ID);
    });

    test('existing env var creds are cleared', async () => {
        const mockInputs = {...CREDS_INPUTS, 'aws-region': 'eu-west-1'};
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(mockInputs));
        process.env.AWS_ACCESS_KEY_ID = 'foo';
        process.env.AWS_SECRET_ACCESS_KEY = 'bar';
        process.env.AWS_SESSION_TOKEN = 'helloworld';
        aws.config.credentials = {
            accessKeyId: 'foo',
            secretAccessKey: 'bar',
            sessionToken: 'helloworld'
        };

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledTimes(0);
        expect(core.exportVariable).toHaveBeenCalledTimes(5);
        expect(core.setSecret).toHaveBeenCalledTimes(3);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', FAKE_ACCESS_KEY_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_SECRET_ACCESS_KEY);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_SECRET_ACCESS_KEY);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', '');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'eu-west-1');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'eu-west-1');
        expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', FAKE_ACCOUNT_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCOUNT_ID);
        expect(aws.config.credentials.accessKeyId).toBe(FAKE_ACCESS_KEY_ID);
        expect(aws.config.credentials.secretAccessKey).toBe(FAKE_SECRET_ACCESS_KEY);
        expect(aws.config.credentials.sessionToken).toBeUndefined();
    });

    test('validates region name', async () => {
        process.env.SHOW_STACK_TRACE = 'false';

        const mockInputs = {...CREDS_INPUTS, 'aws-region': '$AWS_REGION'};
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(mockInputs));

        await run();

        expect(core.setFailed).toHaveBeenCalledWith('Region is not valid: $AWS_REGION');
    });

    test('throws error if access key id exists but missing secret access key', async () => {
        process.env.SHOW_STACK_TRACE = 'false';
        const inputsWIthoutSecretKey = {...ASSUME_ROLE_INPUTS}
        inputsWIthoutSecretKey["aws-secret-access-key"] = undefined
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(inputsWIthoutSecretKey));

        await run();
        expect(core.setFailed).toHaveBeenCalledWith("'aws-secret-access-key' must be provided if 'aws-access-key-id' is provided");

    });

    test('can opt out of masking account ID', async () => {
        const mockInputs = {...CREDS_INPUTS, 'aws-region': 'us-east-1', 'mask-aws-account-id': 'false'};
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(mockInputs));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledTimes(0);
        expect(core.exportVariable).toHaveBeenCalledTimes(4);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', FAKE_ACCESS_KEY_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_SECRET_ACCESS_KEY);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_SECRET_ACCESS_KEY);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'us-east-1');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'us-east-1');
        expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', FAKE_ACCOUNT_ID);
        expect(core.setSecret).toHaveBeenCalledTimes(2);
    });

    test('error is caught by core.setFailed and caught', async () => {
        process.env.SHOW_STACK_TRACE = 'false';

        mockStsCallerIdentity.mockReset();
        mockStsCallerIdentity.mockImplementation(() => {
            throw new Error();
        });

        await run();

        expect(core.setFailed).toBeCalled();
    });

    test('error is caught by core.setFailed and passed', async () => {

        mockStsCallerIdentity.mockReset();
        mockStsCallerIdentity.mockImplementation(() => {
            throw new Error();
        });

        await assert.rejects(() => run());

        expect(core.setFailed).toBeCalled();
    });

    test('basic role assumption exports', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledTimes(1);
        expect(core.exportVariable).toHaveBeenCalledTimes(7);
        expect(core.setSecret).toHaveBeenCalledTimes(7);
        expect(core.setOutput).toHaveBeenCalledTimes(2);

        // first the source credentials are exported and masked
        expect(core.setSecret).toHaveBeenNthCalledWith(1, FAKE_ACCESS_KEY_ID);
        expect(core.setSecret).toHaveBeenNthCalledWith(2, FAKE_SECRET_ACCESS_KEY);
        expect(core.setSecret).toHaveBeenNthCalledWith(3, FAKE_ACCOUNT_ID);

        expect(core.exportVariable).toHaveBeenNthCalledWith(1, 'AWS_DEFAULT_REGION', FAKE_REGION);
        expect(core.exportVariable).toHaveBeenNthCalledWith(2, 'AWS_REGION', FAKE_REGION);
        expect(core.exportVariable).toHaveBeenNthCalledWith(3, 'AWS_ACCESS_KEY_ID', FAKE_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenNthCalledWith(4, 'AWS_SECRET_ACCESS_KEY', FAKE_SECRET_ACCESS_KEY);

        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'aws-account-id', FAKE_ACCOUNT_ID);

        // then the role credentials are exported and masked
        expect(core.setSecret).toHaveBeenNthCalledWith(4, FAKE_STS_ACCESS_KEY_ID);
        expect(core.setSecret).toHaveBeenNthCalledWith(5, FAKE_STS_SECRET_ACCESS_KEY);
        expect(core.setSecret).toHaveBeenNthCalledWith(6, FAKE_STS_SESSION_TOKEN);
        expect(core.setSecret).toHaveBeenNthCalledWith(7, FAKE_ROLE_ACCOUNT_ID);

        expect(core.exportVariable).toHaveBeenNthCalledWith(5, 'AWS_ACCESS_KEY_ID', FAKE_STS_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenNthCalledWith(6, 'AWS_SECRET_ACCESS_KEY', FAKE_STS_SECRET_ACCESS_KEY);
        expect(core.exportVariable).toHaveBeenNthCalledWith(7, 'AWS_SESSION_TOKEN', FAKE_STS_SESSION_TOKEN);

        expect(core.setOutput).toHaveBeenNthCalledWith(2, 'aws-account-id', FAKE_ROLE_ACCOUNT_ID);
    });

    test('assume role can pull source credentials from self-hosted environment', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({'role-to-assume': ROLE_ARN, 'aws-region': FAKE_REGION}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledTimes(1);
        expect(core.exportVariable).toHaveBeenCalledTimes(5);
        expect(core.setSecret).toHaveBeenCalledTimes(5);
        expect(core.setOutput).toHaveBeenCalledTimes(2);

        // first the source account is exported and masked
        expect(core.setSecret).toHaveBeenNthCalledWith(1, FAKE_ACCOUNT_ID);
        expect(core.exportVariable).toHaveBeenNthCalledWith(1, 'AWS_DEFAULT_REGION', FAKE_REGION);
        expect(core.exportVariable).toHaveBeenNthCalledWith(2, 'AWS_REGION', FAKE_REGION);
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'aws-account-id', FAKE_ACCOUNT_ID);

        // then the role credentials are exported and masked
        expect(core.setSecret).toHaveBeenNthCalledWith(2, FAKE_STS_ACCESS_KEY_ID);
        expect(core.setSecret).toHaveBeenNthCalledWith(3, FAKE_STS_SECRET_ACCESS_KEY);
        expect(core.setSecret).toHaveBeenNthCalledWith(4, FAKE_STS_SESSION_TOKEN);
        expect(core.setSecret).toHaveBeenNthCalledWith(5, FAKE_ROLE_ACCOUNT_ID);

        expect(core.exportVariable).toHaveBeenNthCalledWith(3, 'AWS_ACCESS_KEY_ID', FAKE_STS_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenNthCalledWith(4, 'AWS_SECRET_ACCESS_KEY', FAKE_STS_SECRET_ACCESS_KEY);
        expect(core.exportVariable).toHaveBeenNthCalledWith(5, 'AWS_SESSION_TOKEN', FAKE_STS_SESSION_TOKEN);

        expect(core.setOutput).toHaveBeenNthCalledWith(2, 'aws-account-id', FAKE_ROLE_ACCOUNT_ID);
    });

    test('role assumption tags', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_ARN,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 6 * 3600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
            ]
        })
    });

    test('role assumption duration provided', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({...ASSUME_ROLE_INPUTS, 'role-duration-seconds': 5}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_ARN,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 5,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
            ]
        })
    });

    test('role assumption session name provided', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({...ASSUME_ROLE_INPUTS, 'role-session-name': 'MySessionName'}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_ARN,
            RoleSessionName: 'MySessionName',
            DurationSeconds: 6 * 3600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
            ]
        })
    });

    test('sets durationSeconds to one hour when session token provided and no duration is provided', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({...ASSUME_ROLE_INPUTS, 'aws-session-token': FAKE_SESSION_TOKEN}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_ARN,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 3600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
            ]
        })
    });

    test('sets durationSeconds to one 6 hours no session token or duration is provided', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({...ASSUME_ROLE_INPUTS}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_ARN,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 6 * 3600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
            ]
        })
    });

    test('role name provided instead of ARN', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({...CREDS_INPUTS, 'role-to-assume': ROLE_NAME, 'aws-region': FAKE_REGION}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: 'arn:aws:iam::123456789012:role/MY-ROLE',
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 6 * 3600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
            ]
        })
    });

    test('web identity token file provided with absolute path', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({'role-to-assume': ROLE_ARN, 'aws-region': FAKE_REGION, 'web-identity-token-file': '/fake/token/file'}));

        await run();
        expect(mockStsAssumeRoleWithWebIdentity).toHaveBeenCalledWith({
            RoleArn: 'arn:aws:iam::111111111111:role/MY-ROLE',
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 6 * 3600,
            WebIdentityToken: 'testpayload'
        })
    });

    test('web identity token file provided with relative path', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({'role-to-assume': ROLE_ARN, 'aws-region': FAKE_REGION, 'web-identity-token-file': 'fake/token/file'}));

        await run();
        expect(mockStsAssumeRoleWithWebIdentity).toHaveBeenCalledWith({
            RoleArn: 'arn:aws:iam::111111111111:role/MY-ROLE',
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 6 * 3600,
            WebIdentityToken: 'testpayload'
        })
    });

    test('only role arn and region provided to use GH OIDC Token', async () => {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'test-token';

        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({'role-to-assume': ROLE_ARN, 'aws-region': FAKE_REGION}));

        await run();
        expect(mockStsAssumeRoleWithWebIdentity).toHaveBeenCalledWith({
            RoleArn: 'arn:aws:iam::111111111111:role/MY-ROLE',
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 3600,
            WebIdentityToken: 'testtoken'
        });
        expect(core.setSecret).toHaveBeenNthCalledWith(1, FAKE_STS_ACCESS_KEY_ID);
        expect(core.setSecret).toHaveBeenNthCalledWith(2, FAKE_STS_SECRET_ACCESS_KEY);
        expect(core.setSecret).toHaveBeenNthCalledWith(3, FAKE_STS_SESSION_TOKEN);
    });

    test('GH OIDC With custom role duration', async () => {
        const CUSTOM_ROLE_DURATION = 1234;
        process.env.GITHUB_ACTIONS = 'true';
        process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'test-token';
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({'role-to-assume': ROLE_ARN, 'aws-region': FAKE_REGION, 'role-duration-seconds': CUSTOM_ROLE_DURATION}));

        await run();
        expect(mockStsAssumeRoleWithWebIdentity).toHaveBeenCalledWith({
            RoleArn: 'arn:aws:iam::111111111111:role/MY-ROLE',
            RoleSessionName: 'GitHubActions',
            DurationSeconds: CUSTOM_ROLE_DURATION,
            WebIdentityToken: 'testtoken'
        });
        expect(core.setSecret).toHaveBeenNthCalledWith(1, FAKE_STS_ACCESS_KEY_ID);
        expect(core.setSecret).toHaveBeenNthCalledWith(2, FAKE_STS_SECRET_ACCESS_KEY);
        expect(core.setSecret).toHaveBeenNthCalledWith(3, FAKE_STS_SESSION_TOKEN);
    });

    test('role assumption fails after maximun trials using OIDC Provider', async () => {
        process.env.GITHUB_ACTIONS = 'true';
        process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'test-token';

        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({'role-to-assume': ROLE_ARN, 'aws-region': FAKE_REGION}));

        mockStsAssumeRoleWithWebIdentity.mockReset();
        mockStsAssumeRoleWithWebIdentity.mockImplementation(() => {
            throw new Error();
        });

        await assert.rejects(() => run());
        expect(mockStsAssumeRoleWithWebIdentity).toHaveBeenCalledTimes(12)
    });

    test('role external ID provided', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({...ASSUME_ROLE_INPUTS, 'role-external-id': 'abcdef'}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_ARN,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 6 * 3600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
            ],
            ExternalId: 'abcdef'
        })
    });

    test('workflow name sanitized in role assumption tags', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));

        process.env = {...process.env, GITHUB_WORKFLOW: 'Workflow!"#$%&\'()*+, -./:;<=>?@[]^_`{|}~🙂💥🍌1yFvMOeD3ZHYsHrGjCceOboMYzBPo0CRNFdcsVRG6UgR3A912a8KfcBtEVvkAS7kRBq80umGff8mux5IN1y55HQWPNBNyaruuVr4islFXte4FDQZexGJRUSMyHQpxJ8OmZnET84oDmbvmIjgxI6IBrdihX9PHMapT4gQvRYnLqNiKb18rEMWDNoZRy51UPX5sWK2GKPipgKSO9kqLckZai9D2AN2RlWCxtMqChNtxuxjqeqhoQZo0oaq39sjcRZgAAAAAAA'};

        const sanitizedWorkflowName = 'Workflow__________+_ -./:;<=>?@____________1yFvMOeD3ZHYsHrGjCceOboMYzBPo0CRNFdcsVRG6UgR3A912a8KfcBtEVvkAS7kRBq80umGff8mux5IN1y55HQWPNBNyaruuVr4islFXte4FDQZexGJRUSMyHQpxJ8OmZnET84oDmbvmIjgxI6IBrdihX9PHMapT4gQvRYnLqNiKb18rEMWDNoZRy51UPX5sWK2GKPipgKSO9kqLckZa'

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_ARN,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 6 * 3600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: sanitizedWorkflowName},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
            ]
        })
    });

    test('skip tagging provided as true', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({...ASSUME_ROLE_INPUTS, 'role-skip-session-tagging': 'true'}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_ARN,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 21600,
            Tags: undefined
        })
    });

    test('skip tagging provided as false', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({...ASSUME_ROLE_INPUTS, 'role-skip-session-tagging': 'false'}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_ARN,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 21600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
            ]
        })
    });

    test('skip tagging not provided', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({...ASSUME_ROLE_INPUTS}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_ARN,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 21600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
            ]
        })
    });

    test('masks variables before exporting', async () => {
        let maskedValues = [];
        const publicFields = ['AWS_REGION', 'AWS_DEFAULT_REGION'];
        core.setSecret.mockReset();
        core.setSecret.mockImplementation((secret) => {
            maskedValues.push(secret);
        });

        core.exportVariable.mockReset();
        core.exportVariable.mockImplementation((name, value) => {
            if (!maskedValues.includes(value) && !publicFields.includes(name)) {
                throw new Error(value + " for variable " + name + " is not masked yet!");
            }
        });

        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));

        await run();
    });

});
