const core = require('@actions/core');
const assert = require('assert');

const run = require('.');

jest.mock('@actions/core');

const FAKE_ACCESS_KEY_ID = 'MY-AWS-ACCESS-KEY-ID';
const FAKE_SECRET_ACCESS_KEY = 'MY-AWS-SECRET-ACCESS-KEY';
const FAKE_SESSION_TOKEN = 'MY-AWS-SESSION-TOKEN';
const FAKE_STS_ACCESS_KEY_ID = 'STS-AWS-ACCESS-KEY-ID';
const FAKE_STS_SECRET_ACCESS_KEY = 'STS-AWS-SECRET-ACCESS-KEY';
const FAKE_STS_SESSION_TOKEN = 'STS-AWS-SESSION-TOKEN';
const FAKE_REGION = 'fake-region-1';
const FAKE_ACCOUNT_ID = '123456789012';
const ROLE_NAME = 'MY-ROLE';
const ENVIRONMENT_VARIABLE_OVERRIDES = {
    SHOW_STACK_TRACE: 'true',
    GITHUB_REPOSITORY: 'MY-REPOSITORY-NAME',
    GITHUB_WORKFLOW: 'MY-WORKFLOW-ID',
    GITHUB_ACTION: 'MY-ACTION-NAME',
    GITHUB_ACTOR: 'MY-USERNAME[bot]',
    GITHUB_REF: 'MY-BRANCH',
    GITHUB_SHA: 'MY-COMMIT-ID',
};
const GITHUB_ACTOR_SANITIZED = 'MY-USERNAME_bot_'

function mockGetInput(requestResponse) {
    return function (name, options) { // eslint-disable-line no-unused-vars
        return requestResponse[name]
    }
}
const REQUIRED_INPUTS = {
    'aws-access-key-id': FAKE_ACCESS_KEY_ID,
    'aws-secret-access-key': FAKE_SECRET_ACCESS_KEY
};
const DEFAULT_INPUTS = {
    ...REQUIRED_INPUTS,
    'aws-session-token': FAKE_SESSION_TOKEN,
    'aws-region': FAKE_REGION,
    'mask-aws-account-id': 'TRUE'
};
const ASSUME_ROLE_INPUTS = {...REQUIRED_INPUTS, 'role-to-assume': ROLE_NAME, 'aws-region': FAKE_REGION};

const mockStsCallerIdentity = jest.fn();
const mockStsAssumeRole = jest.fn();

jest.mock('aws-sdk', () => {
    return {
        STS: jest.fn(() => ({
            getCallerIdentity: mockStsCallerIdentity,
            assumeRole: mockStsAssumeRole,
        }))
    };
});

describe('Configure AWS Credentials', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {...OLD_ENV, ...ENVIRONMENT_VARIABLE_OVERRIDES};

        jest.clearAllMocks();

        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(DEFAULT_INPUTS));

        mockStsCallerIdentity.mockImplementation(() => {
            return {
                promise() {
                   return Promise.resolve({ Account: FAKE_ACCOUNT_ID });
                }
            };
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
    });

    afterEach(() => {
        process.env = OLD_ENV;
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

    test('session token is optional', async () => {
        const mockInputs = {...REQUIRED_INPUTS, 'aws-region': 'eu-west-1'};
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

    test('can opt out of masking account ID', async () => {
        const mockInputs = {...REQUIRED_INPUTS, 'aws-region': 'us-east-1', 'mask-aws-account-id': 'false'};
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

        mockStsCallerIdentity.mockImplementation(() => {
            throw new Error();
        });

        await run();

        expect(core.setFailed).toBeCalled();
    });

    test('error is caught by core.setFailed and passed', async () => {

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
        expect(core.exportVariable).toHaveBeenCalledTimes(5);
        expect(core.setSecret).toHaveBeenCalledTimes(4);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', FAKE_STS_ACCESS_KEY_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_STS_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_STS_SECRET_ACCESS_KEY);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_STS_SECRET_ACCESS_KEY);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', FAKE_STS_SESSION_TOKEN);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_STS_SESSION_TOKEN);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', FAKE_REGION);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', FAKE_REGION);
        expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', FAKE_ACCOUNT_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCOUNT_ID);
    });

    test('role assumption tags', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_NAME,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 6 * 3600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
            ]
        })
    });

    test('role assumption duration provided', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput({...ASSUME_ROLE_INPUTS, 'role-duration-seconds': 5}));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_NAME,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 5,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
            ]
        })
    });

    test('workflow name sanitized in role assumption tags', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));
        
        process.env = {...process.env, GITHUB_WORKFLOW: 'Workflow!"#$%&\'()*+, -./:;<=>?@[]^_`{|}~🙂💥🍌1yFvMOeD3ZHYsHrGjCceOboMYzBPo0CRNFdcsVRG6UgR3A912a8KfcBtEVvkAS7kRBq80umGff8mux5IN1y55HQWPNBNyaruuVr4islFXte4FDQZexGJRUSMyHQpxJ8OmZnET84oDmbvmIjgxI6IBrdihX9PHMapT4gQvRYnLqNiKb18rEMWDNoZRy51UPX5sWK2GKPipgKSO9kqLckZai9D2AN2RlWCxtMqChNtxuxjqeqhoQZo0oaq39sjcRZgAAAAAAA'};

        const sanitizedWorkflowName = 'Workflow__________+, -./:;<=>?@____________1yFvMOeD3ZHYsHrGjCceOboMYzBPo0CRNFdcsVRG6UgR3A912a8KfcBtEVvkAS7kRBq80umGff8mux5IN1y55HQWPNBNyaruuVr4islFXte4FDQZexGJRUSMyHQpxJ8OmZnET84oDmbvmIjgxI6IBrdihX9PHMapT4gQvRYnLqNiKb18rEMWDNoZRy51UPX5sWK2GKPipgKSO9kqLckZa'

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledWith({
            RoleArn: ROLE_NAME,
            RoleSessionName: 'GitHubActions',
            DurationSeconds: 6 * 3600,
            Tags: [
                {Key: 'GitHub', Value: 'Actions'},
                {Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY},
                {Key: 'Workflow', Value: sanitizedWorkflowName},
                {Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION},
                {Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED},
                {Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF},
                {Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA},
            ]
        })
    });

});
