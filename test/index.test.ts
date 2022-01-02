/* eslint-disable node/no-unpublished-import */
import { run } from '../src/index';
import * as core from '@actions/core';
import { mockClient } from 'aws-sdk-client-mock';
import {
  AssumeRoleCommand,
  AssumeRoleWithWebIdentityCommand,
  GetCallerIdentityCommand,
  STSClient,
} from '@aws-sdk/client-sts';
import * as credentialProviderEnv from '@aws-sdk/credential-provider-env';
import assert = require('assert');

// #region
const FAKE_ACCESS_KEY_ID = 'MY-AWS-ACCESS-KEY-ID';
const FAKE_SECRET_ACCESS_KEY = 'MY-AWS-SECRET-ACCESS-KEY';
const FAKE_SESSION_TOKEN = 'MY-AWS-SESSION-TOKEN';
const FAKE_STS_ACCESS_KEY_ID = 'STS-AWS-ACCESS-KEY-ID';
const FAKE_STS_SECRET_ACCESS_KEY = 'STS-AWS-SECRET-ACCESS-KEY';
const FAKE_STS_SESSION_TOKEN = 'STS-AWS-SESSION-TOKEN';
const FAKE_REGION = 'fake-region-1';
const FAKE_ACCOUNT_ID = '123456789012';
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
  GITHUB_WORKSPACE: '/home/github',
};
const GITHUB_ACTOR_SANITIZED = 'MY-USERNAME_bot_';
const CREDS_INPUTS = {
  'aws-access-key-id': FAKE_ACCESS_KEY_ID,
  'aws-secret-access-key': FAKE_SECRET_ACCESS_KEY,
};
const DEFAULT_INPUTS = {
  ...CREDS_INPUTS,
  'aws-session-token': FAKE_SESSION_TOKEN,
  'aws-region': FAKE_REGION,
  'mask-aws-account-id': 'TRUE',
};
const ASSUME_ROLE_INPUTS = { ...CREDS_INPUTS, 'role-to-assume': ROLE_ARN, 'aws-region': FAKE_REGION };
// #endregion

const mockedSTS = mockClient(STSClient);
function mockGetInput(requestResponse: { [key: string]: string }) {
  return (name: string, _options: unknown) => requestResponse[name];
}
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => 'testpayload'),
}));

describe('Configure AWS Credentials', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockedSTS.reset();
    jest.spyOn(core, 'getIDToken').mockImplementation(() => Promise.resolve('testtoken'));
    jest.spyOn(core, 'exportVariable');
    jest.spyOn(core, 'setSecret');
    jest.spyOn(core, 'setOutput');
    jest.spyOn(core, 'setFailed');
    mockedSTS.on(GetCallerIdentityCommand).resolves({ Account: FAKE_ACCOUNT_ID });
    process.env = { ...OLD_ENV, ...ENVIRONMENT_VARIABLE_OVERRIDES };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test('exports env vars', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(DEFAULT_INPUTS));

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)).toHaveLength(0);
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
    expect(process.env['aws-account-id']).toBeUndefined();
    expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCOUNT_ID);
  });

  test('action fails when github env vars are not set', async () => {
    process.env.SHOW_STACK_TRACE = 'false';
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));
    delete process.env.GITHUB_SHA;

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      'Missing required environment value. Are you running in GitHub Actions?'
    );
  });

  test('action does not require GITHUB_REF env var', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(DEFAULT_INPUTS));
    delete process.env.GITHUB_REF;

    await run();

    expect(core.setFailed).toHaveBeenCalledTimes(0);
  });

  test('hosted runners can pull creds from a self-hosted environment', async () => {
    const mockInputs = { 'aws-region': FAKE_REGION };
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(mockInputs));
    process.env.AWS_ACCESS_KEY_ID = FAKE_ACCESS_KEY_ID;
    process.env.AWS_SECRET_ACCESS_KEY = FAKE_SECRET_ACCESS_KEY;

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)).toHaveLength(0);
    expect(core.exportVariable).toHaveBeenCalledTimes(2);
    expect(core.setSecret).toHaveBeenCalledTimes(1);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', FAKE_REGION);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', FAKE_REGION);
    expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCOUNT_ID);
  });

  test('action with no accessible credentials fails', async () => {
    process.env.SHOW_STACK_TRACE = 'false';
    const mockInputs = { 'aws-region': FAKE_REGION };
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(mockInputs));

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      'Credentials could not be loaded, please check your action inputs: Could not load credentials from any providers'
    );
  });

  test('action with empty credentials fails', async () => {
    process.env.SHOW_STACK_TRACE = 'false';
    const mockInputs = { 'aws-region': FAKE_REGION };
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(mockInputs));
    jest.spyOn(credentialProviderEnv, 'fromEnv').mockReturnValueOnce(() =>
      Promise.resolve({
        accessKeyId: '',
        secretAccessKey: '',
      })
    );

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      'Credentials could not be loaded, please check your action inputs: Access key ID empty after loading credentials'
    );
  });

  test('action fails when credentials are not set in the SDK correctly', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(DEFAULT_INPUTS));
    process.env.SHOW_STACK_TRACE = 'false';
    jest.spyOn(credentialProviderEnv, 'fromEnv').mockReturnValueOnce(() =>
      Promise.resolve({
        accessKeyId: '12345',
        secretAccessKey: '',
      })
    );

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      'Unexpected failure: Credentials loaded by the SDK do not match the access key ID configured by the action'
    );
  });

  test('session token is optional', async () => {
    const mockInputs = { ...CREDS_INPUTS, 'aws-region': 'eu-west-1' };
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(mockInputs));

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)).toHaveLength(0);
    expect(core.exportVariable).toHaveBeenCalledTimes(4);
    expect(core.setSecret).toHaveBeenCalledTimes(3);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', FAKE_ACCESS_KEY_ID);
    expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCESS_KEY_ID);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_SECRET_ACCESS_KEY);
    expect(core.setSecret).toHaveBeenCalledWith(FAKE_SECRET_ACCESS_KEY);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'eu-west-1');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'eu-west-1');
  });

  test('existing env var creds are cleared', async () => {
    const mockInputs = { ...CREDS_INPUTS, 'aws-region': 'eu-west-1' };
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(mockInputs));
    process.env.AWS_ACCESS_KEY_ID = 'foo';
    process.env.AWS_SECRET_ACCESS_KEY = 'bar';
    process.env.AWS_SESSION_TOKEN = 'helloworld';

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)).toHaveLength(0);
    expect(core.exportVariable).toHaveBeenCalledTimes(5);
    expect(core.setSecret).toHaveBeenCalledTimes(3);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', FAKE_ACCESS_KEY_ID);
    expect(core.setSecret).toHaveBeenCalledWith(FAKE_ACCESS_KEY_ID);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', FAKE_SECRET_ACCESS_KEY);
    expect(core.setSecret).toHaveBeenCalledWith(FAKE_SECRET_ACCESS_KEY);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', '');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'eu-west-1');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'eu-west-1');
  });

  test('validates region name', async () => {
    process.env.SHOW_STACK_TRACE = 'false';

    const mockInputs = { ...CREDS_INPUTS, 'aws-region': '$AWS_REGION' };
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(mockInputs));

    await run();

    expect(core.setFailed).toHaveBeenCalledWith('Region is not valid: $AWS_REGION');
  });

  test('throws error if access key id exists but missing secret access key', async () => {
    process.env.SHOW_STACK_TRACE = 'false';
    const inputsWIthoutSecretKey = { ...DEFAULT_INPUTS };
    //@ts-expect-error deleting a required property to test failure condition
    delete inputsWIthoutSecretKey['aws-secret-access-key'];
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(inputsWIthoutSecretKey));

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      "'aws-secret-access-key' must be provided if 'aws-access-key-id' is provided"
    );
  });

  test('can opt out of masking account ID', async () => {
    const mockInputs = { ...CREDS_INPUTS, 'aws-region': 'us-east-1', 'mask-aws-account-id': 'false' };
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(mockInputs));

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)).toHaveLength(0);
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
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(DEFAULT_INPUTS));
    process.env.SHOW_STACK_TRACE = 'false';

    mockedSTS.reset();
    mockedSTS.on(GetCallerIdentityCommand).rejects();

    await run();

    expect(core.setFailed).toHaveBeenCalled();
  });

  test('error is caught by core.setFailed and passed', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(DEFAULT_INPUTS));
    mockedSTS.reset();
    mockedSTS.on(GetCallerIdentityCommand).rejects();

    await assert.rejects(() => run());

    expect(core.setFailed).toHaveBeenCalled();
  });

  test('basic role assumption exports', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)).toHaveLength(1);
    expect(core.exportVariable).toHaveBeenCalledTimes(5);
    expect(core.setSecret).toHaveBeenCalledTimes(4);
    expect(core.setOutput).toHaveBeenCalledTimes(0);

    expect(core.setSecret).toHaveBeenNthCalledWith(1, FAKE_ACCOUNT_ID);
    expect(core.setSecret).toHaveBeenNthCalledWith(2, FAKE_STS_ACCESS_KEY_ID);
    expect(core.setSecret).toHaveBeenNthCalledWith(3, FAKE_STS_SECRET_ACCESS_KEY);
    expect(core.setSecret).toHaveBeenNthCalledWith(4, FAKE_STS_SESSION_TOKEN);

    expect(core.exportVariable).toHaveBeenNthCalledWith(1, 'AWS_DEFAULT_REGION', FAKE_REGION);
    expect(core.exportVariable).toHaveBeenNthCalledWith(2, 'AWS_REGION', FAKE_REGION);
    expect(core.exportVariable).toHaveBeenNthCalledWith(3, 'AWS_ACCESS_KEY_ID', FAKE_STS_ACCESS_KEY_ID);
    expect(core.exportVariable).toHaveBeenNthCalledWith(4, 'AWS_SECRET_ACCESS_KEY', FAKE_STS_SECRET_ACCESS_KEY);
    expect(core.exportVariable).toHaveBeenNthCalledWith(5, 'AWS_SESSION_TOKEN', FAKE_STS_SESSION_TOKEN);
  });

  test('assume role can pull source credentials from self-hosted environment', async () => {
    jest
      .spyOn(core, 'getInput')
      .mockImplementation(mockGetInput({ 'role-to-assume': ROLE_ARN, 'aws-region': FAKE_REGION }));
    process.env.AWS_ACCESS_KEY_ID = FAKE_ACCESS_KEY_ID;
    process.env.AWS_SECRET_ACCESS_KEY = FAKE_SECRET_ACCESS_KEY;
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)).toHaveLength(1);
    expect(core.exportVariable).toHaveBeenCalledTimes(5);
    expect(core.setSecret).toHaveBeenCalledTimes(4);
    expect(core.setOutput).toHaveBeenCalledTimes(0);

    expect(core.setSecret).toHaveBeenNthCalledWith(1, FAKE_ACCOUNT_ID);
    expect(core.setSecret).toHaveBeenNthCalledWith(2, FAKE_STS_ACCESS_KEY_ID);
    expect(core.setSecret).toHaveBeenNthCalledWith(3, FAKE_STS_SECRET_ACCESS_KEY);
    expect(core.setSecret).toHaveBeenNthCalledWith(4, FAKE_STS_SESSION_TOKEN);

    expect(core.exportVariable).toHaveBeenNthCalledWith(1, 'AWS_DEFAULT_REGION', FAKE_REGION);
    expect(core.exportVariable).toHaveBeenNthCalledWith(2, 'AWS_REGION', FAKE_REGION);
    expect(core.exportVariable).toHaveBeenNthCalledWith(3, 'AWS_ACCESS_KEY_ID', FAKE_STS_ACCESS_KEY_ID);
    expect(core.exportVariable).toHaveBeenNthCalledWith(4, 'AWS_SECRET_ACCESS_KEY', FAKE_STS_SECRET_ACCESS_KEY);
    expect(core.exportVariable).toHaveBeenNthCalledWith(5, 'AWS_SESSION_TOKEN', FAKE_STS_SESSION_TOKEN);
  });

  test('role assumption tags', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)[0].args[0].input).toEqual({
      RoleArn: ROLE_ARN,
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 6 * 3600,
      Tags: [
        { Key: 'GitHub', Value: 'Actions' },
        { Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY },
        { Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW },
        { Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION },
        { Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED },
        { Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA },
        { Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF },
      ],
    });
  });

  test('role assumption duration provided', async () => {
    jest
      .spyOn(core, 'getInput')
      .mockImplementation(mockGetInput({ ...ASSUME_ROLE_INPUTS, 'role-duration-seconds': '5' }));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();
    expect(mockedSTS.commandCalls(AssumeRoleCommand)[0].args[0].input).toEqual({
      RoleArn: ROLE_ARN,
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 5,
      Tags: [
        { Key: 'GitHub', Value: 'Actions' },
        { Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY },
        { Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW },
        { Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION },
        { Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED },
        { Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA },
        { Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF },
      ],
    });
  });

  test('role assumption session name provided', async () => {
    jest
      .spyOn(core, 'getInput')
      .mockImplementation(mockGetInput({ ...ASSUME_ROLE_INPUTS, 'role-session-name': 'MySessionName' }));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();
    expect(mockedSTS.commandCalls(AssumeRoleCommand)[0].args[0].input).toEqual({
      RoleArn: ROLE_ARN,
      RoleSessionName: 'MySessionName',
      DurationSeconds: 6 * 3600,
      Tags: [
        { Key: 'GitHub', Value: 'Actions' },
        { Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY },
        { Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW },
        { Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION },
        { Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED },
        { Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA },
        { Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF },
      ],
    });
  });

  test('role name provided instead of ARN', async () => {
    jest
      .spyOn(core, 'getInput')
      .mockImplementation(mockGetInput({ ...ASSUME_ROLE_INPUTS, 'role-to-assume': ROLE_NAME }));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();
    expect(mockedSTS.commandCalls(AssumeRoleCommand)[0].args[0].input).toEqual({
      RoleArn: 'arn:aws:iam::123456789012:role/MY-ROLE',
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 6 * 3600,
      Tags: [
        { Key: 'GitHub', Value: 'Actions' },
        { Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY },
        { Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW },
        { Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION },
        { Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED },
        { Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA },
        { Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF },
      ],
    });
  });

  test('web identity token file provided with absolute path', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(
      mockGetInput({
        'role-to-assume': ROLE_ARN,
        'aws-region': FAKE_REGION,
        'web-identity-token-file': '/fake/token/file',
      })
    );
    mockedSTS.on(AssumeRoleWithWebIdentityCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleWithWebIdentityCommand)[0].args[0].input).toEqual({
      RoleArn: 'arn:aws:iam::111111111111:role/MY-ROLE',
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 6 * 3600,
      WebIdentityToken: 'testpayload',
    });
  });

  test('web identity token file provided with relative path', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(
      mockGetInput({
        'role-to-assume': ROLE_ARN,
        'aws-region': FAKE_REGION,
        'web-identity-token-file': 'fake/token/file',
      })
    );
    mockedSTS.on(AssumeRoleWithWebIdentityCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleWithWebIdentityCommand)[0].args[0].input).toEqual({
      RoleArn: 'arn:aws:iam::111111111111:role/MY-ROLE',
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 6 * 3600,
      WebIdentityToken: 'testpayload',
    });
  });

  test('only role arn and region provided to use GH OIDC Token', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'test-token';

    jest
      .spyOn(core, 'getInput')
      .mockImplementation(mockGetInput({ 'role-to-assume': ROLE_ARN, 'aws-region': FAKE_REGION }));
    mockedSTS.on(AssumeRoleWithWebIdentityCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleWithWebIdentityCommand)[0].args[0].input).toEqual({
      RoleArn: 'arn:aws:iam::111111111111:role/MY-ROLE',
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 3600,
      WebIdentityToken: 'testtoken',
    });
    expect(core.setSecret).toHaveBeenNthCalledWith(1, FAKE_STS_ACCESS_KEY_ID);
    expect(core.setSecret).toHaveBeenNthCalledWith(2, FAKE_STS_SECRET_ACCESS_KEY);
    expect(core.setSecret).toHaveBeenNthCalledWith(3, FAKE_STS_SESSION_TOKEN);
  });

  test('GH OIDC With custom role duration', async () => {
    const CUSTOM_ROLE_DURATION = '1234';
    process.env.GITHUB_ACTIONS = 'true';
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'test-token';
    jest.spyOn(core, 'getInput').mockImplementation(
      mockGetInput({
        'role-to-assume': ROLE_ARN,
        'aws-region': FAKE_REGION,
        'role-duration-seconds': CUSTOM_ROLE_DURATION,
      })
    );
    mockedSTS.on(AssumeRoleWithWebIdentityCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleWithWebIdentityCommand)[0].args[0].input).toEqual({
      RoleArn: 'arn:aws:iam::111111111111:role/MY-ROLE',
      RoleSessionName: 'GitHubActions',
      DurationSeconds: parseInt(CUSTOM_ROLE_DURATION),
      WebIdentityToken: 'testtoken',
    });
    expect(core.setSecret).toHaveBeenNthCalledWith(1, FAKE_STS_ACCESS_KEY_ID);
    expect(core.setSecret).toHaveBeenNthCalledWith(2, FAKE_STS_SECRET_ACCESS_KEY);
    expect(core.setSecret).toHaveBeenNthCalledWith(3, FAKE_STS_SESSION_TOKEN);
  });

  test('role external ID provided', async () => {
    jest
      .spyOn(core, 'getInput')
      .mockImplementation(mockGetInput({ ...ASSUME_ROLE_INPUTS, 'role-external-id': 'abcdef' }));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)[0].args[0].input).toEqual({
      RoleArn: ROLE_ARN,
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 6 * 3600,
      Tags: [
        { Key: 'GitHub', Value: 'Actions' },
        { Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY },
        { Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW },
        { Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION },
        { Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED },
        { Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA },
        { Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF },
      ],
      ExternalId: 'abcdef',
    });
  });

  test('workflow name sanitized in role assumption tags', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    process.env = {
      ...process.env,
      GITHUB_WORKFLOW:
        'Workflow!"#$%&\'()*+, -./:;<=>?@[]^_`{|}~🙂💥🍌1yFvMOeD3ZHYsHrGjCceOboMYzBPo0CRNFdcsVRG6UgR3A912a8KfcBtEVvkAS7kRBq80umGff8mux5IN1y55HQWPNBNyaruuVr4islFXte4FDQZexGJRUSMyHQpxJ8OmZnET84oDmbvmIjgxI6IBrdihX9PHMapT4gQvRYnLqNiKb18rEMWDNoZRy51UPX5sWK2GKPipgKSO9kqLckZai9D2AN2RlWCxtMqChNtxuxjqeqhoQZo0oaq39sjcRZgAAAAAAA',
    };

    const sanitizedWorkflowName =
      'Workflow__________+_ -./:;<=>?@____________1yFvMOeD3ZHYsHrGjCceOboMYzBPo0CRNFdcsVRG6UgR3A912a8KfcBtEVvkAS7kRBq80umGff8mux5IN1y55HQWPNBNyaruuVr4islFXte4FDQZexGJRUSMyHQpxJ8OmZnET84oDmbvmIjgxI6IBrdihX9PHMapT4gQvRYnLqNiKb18rEMWDNoZRy51UPX5sWK2GKPipgKSO9kqLckZa';

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)[0].args[0].input).toEqual({
      RoleArn: ROLE_ARN,
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 6 * 3600,
      Tags: [
        { Key: 'GitHub', Value: 'Actions' },
        { Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY },
        { Key: 'Workflow', Value: sanitizedWorkflowName },
        { Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION },
        { Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED },
        { Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA },
        { Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF },
      ],
    });
  });

  test('skip tagging provided as true', async () => {
    jest
      .spyOn(core, 'getInput')
      .mockImplementation(mockGetInput({ ...ASSUME_ROLE_INPUTS, 'role-skip-session-tagging': 'true' }));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)[0].args[0].input).toEqual({
      RoleArn: ROLE_ARN,
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 21600,
      Tags: undefined,
    });
  });

  test('skip tagging provided as false', async () => {
    jest
      .spyOn(core, 'getInput')
      .mockImplementation(mockGetInput({ ...ASSUME_ROLE_INPUTS, 'role-skip-session-tagging': 'false' }));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)[0].args[0].input).toEqual({
      RoleArn: ROLE_ARN,
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 21600,
      Tags: [
        { Key: 'GitHub', Value: 'Actions' },
        { Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY },
        { Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW },
        { Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION },
        { Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED },
        { Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA },
        { Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF },
      ],
    });
  });

  test('skip tagging not provided', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput({ ...ASSUME_ROLE_INPUTS }));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    await run();

    expect(mockedSTS.commandCalls(AssumeRoleCommand)[0].args[0].input).toEqual({
      RoleArn: ROLE_ARN,
      RoleSessionName: 'GitHubActions',
      DurationSeconds: 21600,
      Tags: [
        { Key: 'GitHub', Value: 'Actions' },
        { Key: 'Repository', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REPOSITORY },
        { Key: 'Workflow', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_WORKFLOW },
        { Key: 'Action', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_ACTION },
        { Key: 'Actor', Value: GITHUB_ACTOR_SANITIZED },
        { Key: 'Commit', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_SHA },
        { Key: 'Branch', Value: ENVIRONMENT_VARIABLE_OVERRIDES.GITHUB_REF },
      ],
    });
  });

  // eslint-disable-next-line jest/expect-expect
  test('masks variables before exporting', async () => {
    jest.spyOn(core, 'getInput').mockImplementation(mockGetInput(ASSUME_ROLE_INPUTS));
    mockedSTS.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });

    const maskedValues: string[] = [];
    const publicFields = ['AWS_REGION', 'AWS_DEFAULT_REGION'];
    jest.spyOn(core, 'setSecret').mockImplementation(secret => {
      maskedValues.push(secret);
    });
    jest.spyOn(core, 'exportVariable').mockImplementation((name, value) => {
      if (!maskedValues.includes(value) && !publicFields.includes(name)) {
        throw new Error(value + ' for variable ' + name + ' is not masked yet!');
      }
      process.env[name] = value;
    });

    await run();
  });

  test('requires source account if only role name is provided', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'test-token';
    process.env.SHOW_STACK_TRACE = 'false';

    jest
      .spyOn(core, 'getInput')
      .mockImplementation(mockGetInput({ 'role-to-assume': 'fakerole', 'aws-region': FAKE_REGION }));
    mockedSTS.on(AssumeRoleWithWebIdentityCommand).resolves({
      Credentials: {
        AccessKeyId: FAKE_STS_ACCESS_KEY_ID,
        SecretAccessKey: FAKE_STS_SECRET_ACCESS_KEY,
        SessionToken: FAKE_STS_SESSION_TOKEN,
        Expiration: new Date(8640000000000000),
      },
    });
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      'Source Account ID is needed if the Role Name is provided and not the Role Arn.'
    );
  });
});
