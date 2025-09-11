import * as core from '@actions/core';
import {
  AssumeRoleCommand,
  AssumeRoleWithWebIdentityCommand,
  GetCallerIdentityCommand,
  STSClient,
} from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { fs, vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialsClient } from '../src/CredentialsClient';
import { run } from '../src/index';
import mocks from './mockinputs.test';

const mockedSTSClient = mockClient(STSClient);

describe('Configure AWS Credentials', {}, () => {
  beforeEach(() => {
    // Reset mock state
    vi.restoreAllMocks();
    mockedSTSClient.reset();
    // Mock GitHub Actions core functions
    vi.spyOn(core, 'exportVariable').mockImplementation((_n, _v) => {});
    vi.spyOn(core, 'setSecret').mockImplementation((_s) => {});
    vi.spyOn(core, 'setFailed').mockImplementation((_m) => {});
    vi.spyOn(core, 'setOutput').mockImplementation((_n, _v) => {});
    vi.spyOn(core, 'debug').mockImplementation((_m) => {});
    vi.spyOn(core, 'info').mockImplementation((_m) => {});
    vi.spyOn(core, 'notice').mockImplementation((_m) => {});
    // Remove any existing environment variables before each test to prevent the
    // SDK from picking them up
    process.env = { ...mocks.envs };
  });

  describe('GitHub OIDC Authentication', {}, () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
    });
    it('exports environment variables', async () => {
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      await run();
      expect(core.info).toHaveBeenCalledWith('Assuming role with OIDC');
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
      expect(core.info).toHaveBeenCalledTimes(2);
      expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', '111111111111');
      expect(core.setOutput).toHaveBeenCalledTimes(2);
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSACCESSKEYID');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSECRETACCESSKEY');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSESSIONTOKEN');
      expect(core.setSecret).toHaveBeenCalledTimes(3);
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'STSAWSACCESSKEYID');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'STSAWSSECRETACCESSKEY');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', 'STSAWSSESSIONTOKEN');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledTimes(5);
      expect(core.setFailed).not.toHaveBeenCalled();
    });
    it('handles the special character workaround', async () => {
      mockedSTSClient
        .on(AssumeRoleWithWebIdentityCommand)
        .resolvesOnce(mocks.outputs.ODD_CHARACTER_CREDENTIALS)
        .resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      await run();
      expect(core.info).toHaveBeenCalledWith('Assuming role with OIDC');
      expect(core.info).toHaveBeenCalledWith('Assuming role with OIDC');
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
      expect(core.info).toHaveBeenCalledTimes(3);
      expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', '111111111111');
      expect(core.setOutput).toHaveBeenCalledTimes(2);
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSACCESSKEYID');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSECRETACCESSKEY');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSESSIONTOKEN');
      expect(core.setSecret).toHaveBeenCalledTimes(3);
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'STSAWSACCESSKEYID');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'STSAWSSECRETACCESSKEY');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', 'STSAWSSESSIONTOKEN');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledTimes(5);
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('IAM User Authentication', {}, () => {
    beforeEach(() => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS));
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValueOnce({
        accessKeyId: 'MYAWSACCESSKEYID',
      });
    });
    it('exports environment variables', async () => {
      await run();
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'MYAWSACCESSKEYID');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'MYAWSSECRETACCESSKEY');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledTimes(4);
      expect(core.setSecret).toHaveBeenCalledWith('MYAWSACCESSKEYID');
      expect(core.setSecret).toHaveBeenCalledWith('MYAWSSECRETACCESSKEY');
      expect(core.setSecret).toHaveBeenCalledTimes(2);
      expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', '111111111111');
      expect(core.setOutput).toHaveBeenCalledTimes(2);
      expect(core.info).toHaveBeenCalledWith('Proceeding with IAM user credentials');
      expect(core.info).toHaveBeenCalledOnce();
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('AssumeRole with IAM LTC', {}, () => {
    beforeEach(() => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.IAM_ASSUMEROLE_INPUTS));
      mockedSTSClient.on(AssumeRoleCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY }); // 3 times
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials')
        .mockResolvedValueOnce({ accessKeyId: 'MYAWSACCESSKEYID' })
        .mockResolvedValueOnce({ accessKeyId: 'STSAWSACCESSKEYID' });
    });
    it('exports environment variables', async () => {
      await run();
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'MYAWSACCESSKEYID');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'MYAWSSECRETACCESSKEY');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'STSAWSACCESSKEYID');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'STSAWSSECRETACCESSKEY');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', 'STSAWSSESSIONTOKEN');
      expect(core.exportVariable).toHaveBeenCalledTimes(7);
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSACCESSKEYID');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSECRETACCESSKEY');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSESSIONTOKEN');
      expect(core.setSecret).toHaveBeenCalledWith('MYAWSACCESSKEYID');
      expect(core.setSecret).toHaveBeenCalledWith('MYAWSSECRETACCESSKEY');
      expect(core.setSecret).toHaveBeenCalledTimes(5);
      expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', '111111111111');
      expect(core.setOutput).toHaveBeenCalledTimes(4);
      expect(core.info).toHaveBeenCalledWith('Assuming role with user credentials');
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
      expect(core.info).toHaveBeenCalledTimes(2);
    });
  });

  describe('AssumeRole with WebIdentityTokeFile', {}, () => {
    beforeEach(() => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.WEBIDENTITY_TOKEN_FILE_INPUTS));
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
      vi.mock('node:fs');
      vol.reset();
      fs.mkdirSync('/home/github', { recursive: true });
      fs.writeFileSync('/home/github/file.txt', 'test-token');
    });
    it('exports environment variables', async () => {
      await run();
      expect(core.info).toHaveBeenCalledWith('Assuming role with web identity token file');
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
      expect(core.info).toHaveBeenCalledTimes(2);
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'STSAWSACCESSKEYID');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'STSAWSSECRETACCESSKEY');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', 'STSAWSSESSIONTOKEN');
      expect(core.exportVariable).toHaveBeenCalledTimes(5);
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSACCESSKEYID');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSECRETACCESSKEY');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSESSIONTOKEN');
      expect(core.setSecret).toHaveBeenCalledTimes(3);
      expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', '111111111111');
      expect(core.setOutput).toHaveBeenCalledTimes(2);
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('Assume existing role', {}, () => {
    beforeEach(() => {
      mockedSTSClient.on(AssumeRoleCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env = { ...mocks.envs };
    });
    it('exports environment variables from env variables', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.EXISTING_ROLE_INPUTS));
      process.env.AWS_ACCESS_KEY_ID = 'MYAWSACCESSKEYID';
      process.env.AWS_SECRET_ACCESS_KEY = 'MYAWSSECRETACCESSKEY';
      process.env.AWS_SESSION_TOKEN = 'MYAWSSESSIONTOKEN';
      await run();
      expect(core.info).toHaveBeenCalledWith('Assuming role with user credentials');
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
      expect(core.info).toHaveBeenCalledTimes(2);
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'STSAWSACCESSKEYID');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'STSAWSSECRETACCESSKEY');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', 'STSAWSSESSIONTOKEN');
      expect(core.exportVariable).toHaveBeenCalledTimes(5);
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSACCESSKEYID');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSECRETACCESSKEY');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSESSIONTOKEN');
      expect(core.setSecret).toHaveBeenCalledTimes(3);
      expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', '111111111111');
      expect(core.setOutput).toHaveBeenCalledTimes(4);
      expect(core.setFailed).not.toHaveBeenCalled();
    });
    it('exports environment variables from inputs', {}, async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.EXISTING_ROLE_INPUTS,
          'aws-access-key-id': 'MYAWSACCESSKEYID',
          'aws-secret-access-key': 'MYAWSSECRETACCESSKEY',
          'aws-session-token': 'MYAWSSESSIONTOKEN',
        }),
      );
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials')
        .mockResolvedValueOnce({
          accessKeyId: 'MYAWSACCESSKEYID',
        })
        .mockResolvedValueOnce({ accessKeyId: 'STSAWSACCESSKEYID' });
      await run();
      expect(core.info).toHaveBeenCalledWith('Assuming role with user credentials');
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
      expect(core.info).toHaveBeenCalledTimes(2);
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'STSAWSACCESSKEYID');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'STSAWSSECRETACCESSKEY');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', 'STSAWSSESSIONTOKEN');
      expect(core.exportVariable).toHaveBeenCalledTimes(8);
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSACCESSKEYID');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSECRETACCESSKEY');
      expect(core.setSecret).toHaveBeenCalledWith('STSAWSSESSIONTOKEN');
      expect(core.setSecret).toHaveBeenCalledTimes(6);
      expect(core.setOutput).toHaveBeenCalledWith('aws-account-id', '111111111111');
      expect(core.setOutput).toHaveBeenCalledTimes(4);
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('Odd inputs', {}, () => {
    it('fails when github env vars are missing', {}, async () => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS));
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_SHA;
      await run();
      expect(core.setFailed).toHaveBeenCalled();
    });
    it('does not fail if GITHUB_REF is missing', {}, async () => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS));
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValueOnce({
        accessKeyId: 'MYAWSACCESSKEYID',
      });
      delete process.env.GITHUB_REF;
      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
    });
    it('fails with an invalid region', {}, async () => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput({ 'aws-region': '$|<1B1D1 701L37' }));
      await run();
      expect(core.setFailed).toHaveBeenCalled();
    });
    it('fails if access key id is provided without secret access key', {}, async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({ ...mocks.IAM_USER_INPUTS, 'aws-secret-access-key': '' }),
      );
      await run();
      expect(core.setFailed).toHaveBeenCalled();
    });
    it('handles improper retry-max-attempts input', {}, async () => {
      // This should mean we retry one time
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'retry-max-attempts': '-1',
          'special-characters-workaround': 'false',
        }),
      );
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
      mockedSTSClient
        .on(AssumeRoleWithWebIdentityCommand)
        .rejectsOnce(new Error('test error'))
        .rejectsOnce(new Error('test error'))
        .resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      await run();
      expect(core.setFailed).toHaveBeenCalled();
    });
    it('fails if doing OIDC without the ACTIONS_ID_TOKEN_REQUEST_TOKEN', {}, async () => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      delete process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
      await run();
      expect(core.setFailed).toHaveBeenCalled();
    });
    it("gets new creds if told to reuse existing but they're invalid", {}, async () => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.USE_EXISTING_CREDENTIALS_INPUTS));
      mockedSTSClient.on(GetCallerIdentityCommand).rejects();
      await run();
      expect(core.notice).toHaveBeenCalledWith('No valid credentials exist. Running as normal.');
    });
    it("doesn't get new creds if there are already valid ones and we said use them", {}, async () => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.USE_EXISTING_CREDENTIALS_INPUTS));
      mockedSTSClient.on(GetCallerIdentityCommand).resolves(mocks.outputs.GET_CALLER_IDENTITY);
      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
    });
    it("doesn't export credentials as environment variables if told not to", {}, async () => {
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.NO_ENV_CREDS_INPUTS));
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
      await run();
      expect(core.setSecret).toHaveBeenCalledTimes(3);
      expect(core.exportVariable).toHaveBeenCalledTimes(0);
      expect(core.setFailed).not.toHaveBeenCalled();
    });
    it('can export creds as step outputs without exporting as env variables', {}, async () => {
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.STEP_BUT_NO_ENV_INPUTS));
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
      await run();
      expect(core.setSecret).toHaveBeenCalledTimes(3);
      expect(core.exportVariable).toHaveBeenCalledTimes(0);
      expect(core.setOutput).toHaveBeenCalledTimes(4);
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('Force Skip OIDC', {}, () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockedSTSClient.reset();
    });

    it('skips OIDC when force-skip-oidc is true with IAM credentials', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_ASSUMEROLE_INPUTS,
          'force-skip-oidc': 'true',
        }),
      );
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials')
        .mockResolvedValueOnce({ accessKeyId: 'MYAWSACCESSKEYID' })
        .mockResolvedValueOnce({ accessKeyId: 'STSAWSACCESSKEYID' });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();
      expect(core.getIDToken).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('skips OIDC when force-skip-oidc is true with web identity token file', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.WEBIDENTITY_TOKEN_FILE_INPUTS,
          'force-skip-oidc': 'true',
        }),
      );
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
      vi.mock('node:fs');
      vol.reset();
      fs.mkdirSync('/home/github', { recursive: true });
      fs.writeFileSync('/home/github/file.txt', 'test-token');

      await run();
      expect(core.getIDToken).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Assuming role with web identity token file');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('fails when force-skip-oidc is true but no alternative credentials provided', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          'role-to-assume': 'arn:aws:iam::111111111111:role/MY-ROLE',
          'aws-region': 'fake-region-1',
          'force-skip-oidc': 'true',
        }),
      );
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();
      expect(core.setFailed).toHaveBeenCalledWith(
        "If 'force-skip-oidc' is true and 'role-to-assume' is set, 'aws-access-key-id' or 'web-identity-token-file' must be set",
      );
    });

    it('allows force-skip-oidc without role-to-assume', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'force-skip-oidc': 'true',
        }),
      );
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');

      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });

      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();
      expect(core.getIDToken).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Proceeding with IAM user credentials');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('uses OIDC when force-skip-oidc is false (default behavior)', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'force-skip-oidc': 'false',
        }),
      );
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();
      expect(core.getIDToken).toHaveBeenCalledWith('');
      expect(core.info).toHaveBeenCalledWith('Assuming role with OIDC');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('uses OIDC when force-skip-oidc is not set (default behavior)', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();
      expect(core.getIDToken).toHaveBeenCalledWith('');
      expect(core.info).toHaveBeenCalledWith('Assuming role with OIDC');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('works with role chaining when force-skip-oidc is true', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.EXISTING_ROLE_INPUTS,
          'force-skip-oidc': 'true',
          'aws-access-key-id': 'MYAWSACCESSKEYID',
          'aws-secret-access-key': 'MYAWSSECRETACCESSKEY',
        }),
      );
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials')
        .mockResolvedValueOnce({ accessKeyId: 'MYAWSACCESSKEYID' })
        .mockResolvedValueOnce({ accessKeyId: 'STSAWSACCESSKEYID' });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();
      expect(core.getIDToken).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('Account ID Validation', {}, () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockedSTSClient.reset();
    });

    it('succeeds when account ID matches allowed list', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'allowed-account-ids': '111111111111',
        }),
      );
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });

      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Proceeding with IAM user credentials');
    });

    it('succeeds with multiple allowed account IDs when account matches', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'allowed-account-ids': '999999999999,111111111111,222222222222',
        }),
      );
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });

      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('fails when account ID does not match allowed list', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'allowed-account-ids': '999999999999',
        }),
      );
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });

      await run();
      expect(core.setFailed).toHaveBeenCalledWith(
        'The account ID of the provided credentials (111111111111) does not match any of the expected account IDs: 999999999999',
      );
    });

    it('fails when account ID does not match any in multiple allowed accounts', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'allowed-account-ids': '999999999999,888888888888',
        }),
      );

      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });

      await run();
      expect(core.setFailed).toHaveBeenCalledWith(
        'The account ID of the provided credentials (111111111111) does not match any of the expected account IDs: 999999999999, 888888888888',
      );
    });

    it('works with assume role when account ID matches', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_ASSUMEROLE_INPUTS,
          'allowed-account-ids': '111111111111',
        }),
      );
      mockedSTSClient.on(AssumeRoleCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials')
        .mockResolvedValueOnce({ accessKeyId: 'MYAWSACCESSKEYID' })
        .mockResolvedValueOnce({ accessKeyId: 'STSAWSACCESSKEYID' });

      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
    });

    it('works with OIDC when account ID matches', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'allowed-account-ids': '111111111111',
        }),
      );
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
    });

    it('handles GetCallerIdentity API failure gracefully', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'allowed-account-ids': '111111111111',
        }),
      );
      mockedSTSClient.on(GetCallerIdentityCommand).rejects(new Error('API Error'));
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });

      await run();
      expect(core.setFailed).toHaveBeenCalledWith('Could not validate account ID of credentials: API Error');
    });

    it('ignores validation when allowed-account-ids is empty', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'allowed-account-ids': '',
        }),
      );
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });

      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Proceeding with IAM user credentials');
    });

    it('handles whitespace in allowed-account-ids input', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'allowed-account-ids': ' 111111111111 , 222222222222 ',
        }),
      );
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });

      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('Global Timeout Configuration', {}, () => {
    beforeEach(() => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS));
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValueOnce({
        accessKeyId: 'MYAWSACCESSKEYID',
      });
    });

    it('sets timeout when action-timeout-s is provided', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const infoSpy = vi.spyOn(core, 'info');
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'action-timeout-s': '30',
        }),
      );

      await run();

      expect(infoSpy).toHaveBeenCalledWith('Setting a global timeout of 30 seconds for the action');
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.any(Object));
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('does not set timeout when action-timeout-s is 0', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const infoSpy = vi.spyOn(core, 'info');
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'action-timeout-s': '0',
        }),
      );

      await run();

      expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining('Setting a global timeout'));
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('does not set timeout when action-timeout-s is not provided', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const infoSpy = vi.spyOn(core, 'info');

      await run();

      expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining('Setting a global timeout'));
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('timeout callback calls setFailed and exits process', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'action-timeout-s': '5',
        }),
      );

      await run();

      // Get the timeout callback function
      const timeoutCallback = setTimeoutSpy.mock.calls[0][0] as () => void;
      
      // Execute the timeout callback
      timeoutCallback();

      expect(core.setFailed).toHaveBeenCalledWith('Action timed out after 5 seconds');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('HTTP Proxy Configuration', {}, () => {
    beforeEach(() => {
      vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      vi.spyOn(core, 'getIDToken').mockResolvedValue('testoidctoken');
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
    });

    it('configures proxy from http-proxy input', async () => {
      const infoSpy = vi.spyOn(core, 'info');
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'http-proxy': 'http://proxy.example.com:8080',
        }),
      );

      await run();

      expect(infoSpy).toHaveBeenCalledWith('Configuring proxy handler for STS client');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('configures proxy from HTTP_PROXY environment variable', async () => {
      const infoSpy = vi.spyOn(core, 'info');
      process.env.HTTP_PROXY = 'http://proxy.example.com:8080';

      await run();

      expect(infoSpy).toHaveBeenCalledWith('Configuring proxy handler for STS client');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('configures proxy from HTTPS_PROXY environment variable', async () => {
      const infoSpy = vi.spyOn(core, 'info');
      process.env.HTTPS_PROXY = 'https://proxy.example.com:8080';

      await run();

      expect(infoSpy).toHaveBeenCalledWith('Configuring proxy handler for STS client');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('prioritizes http-proxy input over environment variables', async () => {
      const infoSpy = vi.spyOn(core, 'info');
      process.env.HTTP_PROXY = 'http://env-proxy.example.com:8080';
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'http-proxy': 'http://input-proxy.example.com:8080',
        }),
      );

      await run();

      expect(infoSpy).toHaveBeenCalledWith('Configuring proxy handler for STS client');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('properly configures proxy agent in STS client', async () => {
      const infoSpy = vi.spyOn(core, 'info');

      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'http-proxy': 'http://proxy.example.com:8080',
        }),
      );

      await run();

      expect(infoSpy).toHaveBeenCalledWith('Configuring proxy handler for STS client');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('configures no-proxy setting', async () => {
      vi.spyOn(core, 'getInput').mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'http-proxy': 'http://proxy.example.com:8080',
          'no-proxy': 'localhost,127.0.0.1',
        }),
      );

      await run();

      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('works without proxy configuration', async () => {
      await run();

      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });
});
