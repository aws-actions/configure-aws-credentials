const core = require('@actions/core');

const run = require('.');

jest.mock('@actions/core');

const mockStsCallerIdentity = jest.fn();
jest.mock('aws-sdk', () => {
    return {
        STS: jest.fn(() => ({
            getCallerIdentity: mockStsCallerIdentity
        }))
    };
});

describe('Configure AWS Credentials', () => {

    beforeEach(() => {
        jest.clearAllMocks();

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('MY-AWS-ACCESS-KEY-ID')     // aws-access-key-id
            .mockReturnValueOnce('MY-AWS-SECRET-ACCESS-KEY') // aws-secret-access-key
            .mockReturnValueOnce('us-east-2')                // aws-default-region
            .mockReturnValueOnce('MY-AWS-SESSION-TOKEN');    // aws-session-token

        mockStsCallerIdentity.mockImplementation(() => {
            return {
                promise() {
                   return Promise.resolve({ Account: '123456789012' });
                }
            };
        });
    });

    test('exports env vars', async () => {
        await run();
        expect(core.exportVariable).toHaveBeenCalledTimes(5);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'MY-AWS-ACCESS-KEY-ID');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'MY-AWS-SECRET-ACCESS-KEY');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', 'MY-AWS-SESSION-TOKEN');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'us-east-2');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'us-east-2');
        expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', '123456789012');
    });

    test('session token is optional', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('MY-AWS-ACCESS-KEY-ID')     // aws-access-key-id
            .mockReturnValueOnce('MY-AWS-SECRET-ACCESS-KEY') // aws-secret-access-key
            .mockReturnValueOnce('eu-west-1');               // aws-default-region

        await run();
        expect(core.exportVariable).toHaveBeenCalledTimes(4);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'MY-AWS-ACCESS-KEY-ID');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'MY-AWS-SECRET-ACCESS-KEY');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'eu-west-1');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'eu-west-1');
        expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', '123456789012');
    });

    test('error is caught by core.setFailed', async () => {
        mockStsCallerIdentity.mockImplementation(() => {
            throw new Error();
        });

        await run();

        expect(core.setFailed).toBeCalled();
    });
});
