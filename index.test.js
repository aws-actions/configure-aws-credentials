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
const ASSUME_ROLE_INPUTS = {...REQUIRED_INPUTS, 'role-to-assume': ROLE_NAME};

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
    let originalSuppress;

    beforeEach(() => {
        originalSuppress = process.env.DO_NOT_SUPPRESS_STACK_TRACE;
        process.env.DO_NOT_SUPPRESS_STACK_TRACE = 'true';

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
        process.env.DO_NOT_SUPPRESS_STACK_TRACE = originalSuppress;
    });

    test('exports env vars', async () => {
        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledTimes(0);
        expect(core.exportVariable).toHaveBeenCalledTimes(5);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', FAKE_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_SECRET_ACCESS_KEY);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', FAKE_SESSION_TOKEN);
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
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', FAKE_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_SECRET_ACCESS_KEY);
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
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_SECRET_ACCESS_KEY);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'us-east-1');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'us-east-1');
        expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', FAKE_ACCOUNT_ID);
        expect(core.setSecret).toHaveBeenCalledTimes(0);
    });

    test('error is caught by core.setFailed and caught', async () => {
        process.env.DO_NOT_SUPPRESS_STACK_TRACE = 'false';

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

    test('basic role assumption', async () => {
        core.getInput = jest
            .fn()
            .mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));

        await run();
        expect(mockStsAssumeRole).toHaveBeenCalledTimes(1);
        expect(core.exportVariable).toHaveBeenCalledTimes(5);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', FAKE_STS_ACCESS_KEY_ID);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_STS_SECRET_ACCESS_KEY);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', FAKE_STS_SESSION_TOKEN);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', FAKE_REGION);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', FAKE_REGION);
        expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', FAKE_ACCOUNT_ID);
        expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCOUNT_ID);
    });

});
