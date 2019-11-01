const core = require('@actions/core');
const io = require('@actions/io');

const run = require('.');

jest.mock('@actions/core');
jest.mock('@actions/io');

describe('Setup AWS', () => {

    beforeEach(() => {
        jest.clearAllMocks();

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('MY-AWS-ACCESS-KEY-ID')     // aws-access-key-id
            .mockReturnValueOnce('MY-AWS-SECRET-ACCESS-KEY') // aws-secret-access-key
            .mockReturnValueOnce('us-east-2')                // aws-default-region
            .mockReturnValueOnce('json');                    // aws-default-output
    });

    test('exports env vars', async () => {
        await run();
        expect(core.exportVariable).toHaveBeenCalledTimes(6);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'MY-AWS-ACCESS-KEY-ID');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'MY-AWS-SECRET-ACCESS-KEY');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'us-east-2');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_OUTPUT', 'json');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_CONFIG_FILE', '/runner/home/.aws/config');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SHARED_CREDENTIALS_FILE', '/runner/home/.aws/credentials');
    });

    test('aws can be configured for a different region', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('MY-AWS-ACCESS-KEY-ID')     // aws-access-key-id
            .mockReturnValueOnce('MY-AWS-SECRET-ACCESS-KEY') // aws-secret-access-key
            .mockReturnValueOnce('eu-west-1')                // aws-default-region
            .mockReturnValueOnce('json');                    // aws-default-output

        await run();
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'eu-west-1');
    });

    test('error is caught by core.setFailed', async () => {
        io.mkdirP = jest
            .fn()
            .mockImplementation(() => {
                throw new Error();
            });

        await run();

        expect(core.setFailed).toBeCalled();
    });
});
