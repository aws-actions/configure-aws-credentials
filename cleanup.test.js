const core = require('@actions/core');
const cleanup = require('./cleanup.js');

jest.mock('@actions/core');

const FAKE_ACCESS_KEY_ID = 'MY-AWS-ACCESS-KEY-ID';
const FAKE_SECRET_ACCESS_KEY = 'MY-AWS-SECRET-ACCESS-KEY';
const FAKE_SESSION_TOKEN = 'MY-AWS-SESSION-TOKEN';
const FAKE_REGION = 'fake-region-1';
const ACTION_ENVIRONMENT_VARIABLES = {
    AWS_ACCESS_KEY_ID: FAKE_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: FAKE_SECRET_ACCESS_KEY,
    AWS_SESSION_TOKEN: FAKE_SESSION_TOKEN,
    AWS_DEFAULT_REGION: FAKE_REGION,
    AWS_REGION: FAKE_REGION,
};

describe('Configure AWS Credentials', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {...OLD_ENV, ...ACTION_ENVIRONMENT_VARIABLES};
    });

    afterEach(() => {
        process.env = OLD_ENV;
    });

    test('replaces AWS credential and region env vars with empty strings', async () => {
        await cleanup();
        expect(core.setFailed).toHaveBeenCalledTimes(0);
        expect(core.exportVariable).toHaveBeenCalledTimes(5);
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', '');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', '');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', '');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', '');
        expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', '');
    });

    test('error is caught and fails the action', async () => {
        core.exportVariable.mockReset();
        core.exportVariable.mockImplementation(() => {
            throw new Error();
        });

        await cleanup();

        expect(core.setFailed).toBeCalled();
    });
});
