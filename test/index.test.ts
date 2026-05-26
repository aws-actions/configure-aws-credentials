import * as core from '@actions/core';
import {
  AssumeRoleCommand,
  AssumeRoleWithWebIdentityCommand,
  GetCallerIdentityCommand,
  STSClient,
} from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { fs, vol } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialsClient } from '../src/CredentialsClient';
import * as helpers from '../src/helpers';
import { run } from '../src/index';
import * as profileManager from '../src/profileManager';
import mocks from './mockinputs.test';

vi.mock('@actions/core');
vi.mock('node:fs');

const mockedSTSClient = mockClient(STSClient);

describe('Configure AWS Credentials', {}, () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedSTSClient.reset();
    vi.mocked(core.getInput).mockReturnValue('');
    vi.mocked(core.getMultilineInput).mockReturnValue([]);
    // Inject no-op sleep to avoid real delays during retries in tests
    helpers.withsleep(() => Promise.resolve());
    // Remove any existing environment variables before each test to prevent the
    // SDK from picking them up
    process.env = { ...mocks.envs };
  });

  afterEach(() => {
    helpers.reset();
  });

  describe('GitHub OIDC Authentication', {}, () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
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
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS));
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
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_ASSUMEROLE_INPUTS));
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

  // Regression test for #1554: IAM keys + role-to-assume on a self-hosted runner
  // with ambient credentials (e.g. an EC2 instance profile), and output-env-credentials=false.
  // The post-assume-role validation must be skipped, otherwise the SDK loads the runner's
  // ambient access key (which doesn't match the assumed role's) and the action fails.
  describe('AssumeRole with IAM LTC and output-env-credentials=false', {}, () => {
    it('does not validate against ambient credentials', async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_ASSUMEROLE_NO_ENV_INPUTS));
      mockedSTSClient.on(AssumeRoleCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // Simulate the runner's ambient instance-profile credentials.
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'AMBIENTINSTANCEPROFILEID',
      });
      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.exportVariable).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('aws-access-key-id', 'STSAWSACCESSKEYID');
      expect(core.setOutput).toHaveBeenCalledWith('aws-secret-access-key', 'STSAWSSECRETACCESSKEY');
      expect(core.setOutput).toHaveBeenCalledWith('aws-session-token', 'STSAWSSESSIONTOKEN');
    });
  });

  describe('AssumeRole with WebIdentityTokeFile', {}, () => {
    beforeEach(() => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.WEBIDENTITY_TOKEN_FILE_INPUTS));
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
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
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.EXISTING_ROLE_INPUTS));
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
      vi.mocked(core.getInput).mockImplementation(
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

  describe('Default session tags', {}, () => {
    beforeEach(() => {
      mockedSTSClient.on(AssumeRoleCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials')
        .mockResolvedValueOnce({ accessKeyId: 'MYAWSACCESSKEYID' })
        .mockResolvedValueOnce({ accessKeyId: 'STSAWSACCESSKEYID' });
    });
    it('emits exactly the expected default tag set with no custom-tags', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_ASSUMEROLE_INPUTS));
      await run();
      const tags = mockedSTSClient.commandCalls(AssumeRoleCommand)[0].args[0].input.Tags ?? [];
      // 7 protected (GitHub + Repository, Workflow, Action, Actor, Commit, Branch)
      // + 8 overrideable (EventName, BaseRef, HeadRef, RefName, RunId, RefType, Job, TriggeringActor).
      // No custom-tags, all env vars set in mocks.envs → all 15 should be present, nothing else.
      expect(tags).toHaveLength(15);
      const tagsByKey = Object.fromEntries(tags.map((t) => [t.Key, t.Value]));
      expect(tagsByKey).toEqual({
        GitHub: 'Actions',
        Repository: 'MY-REPOSITORY-NAME',
        Workflow: 'MY-WORKFLOW-ID',
        Action: 'MY-ACTION-NAME',
        Actor: 'MY-USERNAME_bot_',
        Commit: 'MY-COMMIT-ID',
        Branch: 'refs/pull/42/merge',
        EventName: 'pull_request',
        BaseRef: 'main',
        HeadRef: 'feature-branch',
        RefName: 'feature-branch',
        RunId: '16412345678',
        RefType: 'branch',
        Job: 'build',
        TriggeringActor: 'MY-USERNAME_bot_',
      });
    });
    it('omits overrideable tags whose env vars are unset', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_ASSUMEROLE_INPUTS));
      delete process.env.GITHUB_BASE_REF;
      delete process.env.GITHUB_HEAD_REF;
      delete process.env.GITHUB_TRIGGERING_ACTOR;
      await run();
      const tags = mockedSTSClient.commandCalls(AssumeRoleCommand)[0].args[0].input.Tags ?? [];
      const tagKeys = tags.map((t) => t.Key);
      expect(tagKeys).not.toContain('BaseRef');
      expect(tagKeys).not.toContain('HeadRef');
      expect(tagKeys).not.toContain('TriggeringActor');
      expect(tagKeys).toContain('EventName');
      expect(tagKeys).toContain('RunId');
    });
    it('sanitizes invalid characters in env-derived tag values', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_ASSUMEROLE_INPUTS));
      process.env.GITHUB_HEAD_REF = 'feature/has spaces&bad?chars';
      await run();
      expect(mockedSTSClient.commandCalls(AssumeRoleCommand)[0].args[0].input).toMatchObject({
        Tags: expect.arrayContaining([{ Key: 'HeadRef', Value: 'feature/has spaces_bad_chars' }]),
      });
    });
    it('truncates env-derived tag values longer than 256 characters', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_ASSUMEROLE_INPUTS));
      process.env.GITHUB_HEAD_REF = 'a'.repeat(300);
      await run();
      const tags = mockedSTSClient.commandCalls(AssumeRoleCommand)[0].args[0].input.Tags ?? [];
      const headRef = tags.find((t) => t.Key === 'HeadRef');
      expect(headRef?.Value).toHaveLength(256);
    });
  });

  describe('Custom Tags', {}, () => {
    beforeEach(() => {
      mockedSTSClient.on(AssumeRoleCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials')
        .mockResolvedValueOnce({ accessKeyId: 'MYAWSACCESSKEYID' })
        .mockResolvedValueOnce({ accessKeyId: 'STSAWSACCESSKEYID' });
    });
    it('rejects invalid JSON in custom tags', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.CUSTOM_TAGS_INVALID_JSON_INPUTS));
      await run();
      expect(core.setFailed).toHaveBeenCalledWith('custom-tags: input is not valid JSON');
      expect(mockedSTSClient.commandCalls(AssumeRoleCommand)).toHaveLength(0);
    });
    it('handles valid custom tags', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.CUSTOM_TAGS_OBJECT_INPUTS));
      await run();
      expect(core.info).toHaveBeenCalledWith('Assuming role with user credentials');
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
      expect(mockedSTSClient.commandCalls(AssumeRoleCommand)[0].args[0].input).toMatchObject({
        Tags: expect.arrayContaining([
          { Key: 'GitHub', Value: 'Actions' },
          { Key: 'Repository', Value: 'MY-REPOSITORY-NAME' },
          { Key: 'Workflow', Value: 'MY-WORKFLOW-ID' },
          { Key: 'Action', Value: 'MY-ACTION-NAME' },
          { Key: 'Actor', Value: 'MY-USERNAME_bot_' },
          { Key: 'Commit', Value: 'MY-COMMIT-ID' },
          { Key: 'Branch', Value: 'refs/pull/42/merge' },
          { Key: 'BaseRef', Value: 'main' },
          { Key: 'HeadRef', Value: 'feature-branch' },
          { Key: 'EventName', Value: 'pull_request' },
          { Key: 'RunId', Value: '16412345678' },
          { Key: 'Job', Value: 'build' },
          { Key: 'RefName', Value: 'feature-branch' },
          { Key: 'RefType', Value: 'branch' },
          { Key: 'TriggeringActor', Value: 'MY-USERNAME_bot_' },
          { Key: 'Environment', Value: 'Production' },
          { Key: 'Team', Value: 'DevOps' },
        ]),
      });
    });
    it('rejects array input for custom tags', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.CUSTOM_TAGS_ARRAY_INPUTS));
      await run();
      expect(core.setFailed).toHaveBeenCalledWith(
        'custom-tags: input must be a JSON object (not an array or primitive)',
      );
      expect(mockedSTSClient.commandCalls(AssumeRoleCommand)).toHaveLength(0);
    });
    it('rejects custom tags that conflict with protected session tags', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.CUSTOM_TAGS_RESERVED_KEY_INPUTS));
      await run();
      expect(core.setFailed).toHaveBeenCalledWith(
        "custom-tags: key 'Repository' conflicts with a protected session tag set by this action and cannot be overridden",
      );
      expect(mockedSTSClient.commandCalls(AssumeRoleCommand)).toHaveLength(0);
    });
    it('rejects custom tags with invalid key characters', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.CUSTOM_TAGS_INVALID_KEY_CHARS_INPUTS));
      await run();
      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining("custom-tags: key 'invalid{key}' contains invalid characters"),
      );
      expect(mockedSTSClient.commandCalls(AssumeRoleCommand)).toHaveLength(0);
    });
    it('warns when custom tags are used with OIDC', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'custom-tags': JSON.stringify({ MyTag: 'value' }),
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'STSAWSACCESSKEYID',
      });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
      await run();
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining("'custom-tags' is set but will be ignored"));
    });
    it('lets custom tags override overrideable default tag keys', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_ASSUMEROLE_INPUTS,
          'custom-tags': JSON.stringify({ EventName: 'workflow_dispatch', BaseRef: 'release/2026' }),
        }),
      );
      await run();
      const tags = mockedSTSClient.commandCalls(AssumeRoleCommand)[0].args[0].input.Tags ?? [];
      const eventNameTags = tags.filter((t) => t.Key === 'EventName');
      const baseRefTags = tags.filter((t) => t.Key === 'BaseRef');
      expect(eventNameTags).toHaveLength(1);
      expect(eventNameTags[0]?.Value).toBe('workflow_dispatch');
      expect(baseRefTags).toHaveLength(1);
      expect(baseRefTags[0]?.Value).toBe('release/2026');
    });
    it('rejects custom tags that conflict with the protected Branch tag', {}, async () => {
      // Regression guard: Branch was a default before v6.2 and must remain unoverridable.
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_ASSUMEROLE_INPUTS,
          'custom-tags': JSON.stringify({ Branch: 'evil-branch' }),
        }),
      );
      await run();
      expect(core.setFailed).toHaveBeenCalledWith(
        "custom-tags: key 'Branch' conflicts with a protected session tag set by this action and cannot be overridden",
      );
      expect(mockedSTSClient.commandCalls(AssumeRoleCommand)).toHaveLength(0);
    });
    it('drops lower-priority overrideable tags when custom-tags would exceed the session-tag limit', {}, async () => {
      // 7 protected (GitHub + 6 from PROTECTED_TAG_SOURCES) + 40 custom = 47 used → 3 overrideable slots.
      // The first 3 overrideable tags by priority are EventName, BaseRef, HeadRef (RefName, RunId, RefType,
      // Job, TriggeringActor must be dropped).
      const customTagsObj: Record<string, string> = {};
      for (let i = 0; i < 40; i++) {
        customTagsObj[`Custom${i}`] = `value${i}`;
      }
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_ASSUMEROLE_INPUTS,
          'custom-tags': JSON.stringify(customTagsObj),
        }),
      );
      await run();
      const tags = mockedSTSClient.commandCalls(AssumeRoleCommand)[0].args[0].input.Tags ?? [];
      const tagKeys = tags.map((t) => t.Key);
      expect(tags).toHaveLength(50);
      expect(tagKeys).toContain('Branch');
      expect(tagKeys).toContain('EventName');
      expect(tagKeys).toContain('BaseRef');
      expect(tagKeys).toContain('HeadRef');
      expect(tagKeys).not.toContain('RefName');
      expect(tagKeys).not.toContain('RunId');
      expect(tagKeys).not.toContain('RefType');
      expect(tagKeys).not.toContain('Job');
      expect(tagKeys).not.toContain('TriggeringActor');
    });
    it('overridden overrideable tags free a slot for a lower-priority overrideable tag', {}, async () => {
      // Same 40-custom-tag scenario as above, but one of the customs overrides BaseRef.
      // BaseRef no longer competes for the overrideable budget, so the next-priority overrideable (RefName) gets in.
      const customTagsObj: Record<string, string> = { BaseRef: 'release/2026' };
      for (let i = 0; i < 39; i++) {
        customTagsObj[`Custom${i}`] = `value${i}`;
      }
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_ASSUMEROLE_INPUTS,
          'custom-tags': JSON.stringify(customTagsObj),
        }),
      );
      await run();
      const tags = mockedSTSClient.commandCalls(AssumeRoleCommand)[0].args[0].input.Tags ?? [];
      const tagKeys = tags.map((t) => t.Key);
      expect(tags).toHaveLength(50);
      expect(tagKeys).toContain('Branch');
      expect(tagKeys).toContain('EventName');
      expect(tagKeys).toContain('BaseRef');
      expect(tagKeys).toContain('HeadRef');
      expect(tagKeys).toContain('RefName');
      expect(tagKeys).not.toContain('RunId');
    });
    it('rejects custom-tags that would exceed the session-tag limit on their own', {}, async () => {
      // 7 protected + 44 custom = 51, which is over 50 even with zero overrideable tags.
      const customTagsObj: Record<string, string> = {};
      for (let i = 0; i < 44; i++) {
        customTagsObj[`Custom${i}`] = `value${i}`;
      }
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_ASSUMEROLE_INPUTS,
          'custom-tags': JSON.stringify(customTagsObj),
        }),
      );
      await run();
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('would exceed the AWS limit of 50'));
      expect(mockedSTSClient.commandCalls(AssumeRoleCommand)).toHaveLength(0);
    });
    it('drops transitive-tag-keys entries that refer to evicted overrideable tags', {}, async () => {
      // Force eviction of all overrideable tags below EventName/BaseRef/HeadRef. The user transitive-tags
      // RunId (which gets evicted) and Repository (which is protected and stays). The TransitiveTagKeys
      // payload must include only the keys that actually appear in Tags.
      const customTagsObj: Record<string, string> = {};
      for (let i = 0; i < 40; i++) {
        customTagsObj[`Custom${i}`] = `value${i}`;
      }
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_ASSUMEROLE_INPUTS,
          'custom-tags': JSON.stringify(customTagsObj),
        }),
      );
      vi.mocked(core.getMultilineInput).mockImplementation((name: string) => {
        if (name === 'transitive-tag-keys') return ['Repository', 'RunId'];
        return [];
      });
      await run();
      const callInput = mockedSTSClient.commandCalls(AssumeRoleCommand)[0].args[0].input;
      const tagKeys = (callInput.Tags ?? []).map((t) => t.Key);
      expect(tagKeys).not.toContain('RunId');
      expect(callInput.TransitiveTagKeys).toEqual(['Repository']);
    });
  });

  describe('Odd inputs', {}, () => {
    it('fails when github env vars are missing', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_ASSUMEROLE_INPUTS));
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_SHA;
      await run();
      expect(core.setFailed).toHaveBeenCalled();
    });
    it('does not fail if GITHUB_REF is missing', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS));
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
      vi.mocked(core.getInput).mockImplementation(mocks.getInput({ 'aws-region': '$|<1B1D1 701L37' }));
      await run();
      expect(core.setFailed).toHaveBeenCalled();
    });
    it('fails with a role-session-name containing invalid characters', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({ ...mocks.IAM_ASSUMEROLE_INPUTS, 'role-session-name': 'invalid session!' }),
      );
      await run();
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Role session name is not valid'));
    });
    it('fails with a role-session-name that is too short', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({ ...mocks.IAM_ASSUMEROLE_INPUTS, 'role-session-name': 'a' }),
      );
      await run();
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('must be between 2 and 64 characters'));
    });
    it('fails with a role-session-name that is too long', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({ ...mocks.IAM_ASSUMEROLE_INPUTS, 'role-session-name': 'a'.repeat(65) }),
      );
      await run();
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('must be between 2 and 64 characters'));
    });
    it('fails if access key id is provided without secret access key', {}, async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({ ...mocks.IAM_USER_INPUTS, 'aws-secret-access-key': '' }),
      );
      await run();
      expect(core.setFailed).toHaveBeenCalled();
    });

    it('handles improper retry-max-attempts input', {}, async () => {
      // This should mean we retry one time
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'retry-max-attempts': '-1',
          'special-characters-workaround': 'false',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
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
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockRejectedValue(
        new Error('No credentials available'),
      );
      delete process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
      await run();
      expect(core.setFailed).toHaveBeenCalled();
    });
    it("gets new creds if told to reuse existing but they're invalid", {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.USE_EXISTING_CREDENTIALS_INPUTS));
      mockedSTSClient.on(GetCallerIdentityCommand).rejects();
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockRejectedValue(
        new Error('No credentials available'),
      );
      await run();
      expect(core.notice).toHaveBeenCalledWith('No valid credentials exist. Running as normal.');
    });
    it("doesn't get new creds if there are already valid ones and we said use them", {}, async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.USE_EXISTING_CREDENTIALS_INPUTS));
      mockedSTSClient.on(GetCallerIdentityCommand).resolves(mocks.outputs.GET_CALLER_IDENTITY);
      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
    });
    it("doesn't export credentials as environment variables if told not to", {}, async () => {
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.NO_ENV_CREDS_INPUTS));
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
      await run();
      expect(core.setSecret).toHaveBeenCalledTimes(3);
      expect(core.exportVariable).toHaveBeenCalledTimes(0);
      expect(core.setFailed).not.toHaveBeenCalled();
    });
    it('can export creds as step outputs without exporting as env variables', {}, async () => {
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.STEP_BUT_NO_ENV_INPUTS));
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
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
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_ASSUMEROLE_INPUTS,
          'force-skip-oidc': 'true',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
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
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.WEBIDENTITY_TOKEN_FILE_INPUTS,
          'force-skip-oidc': 'true',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
      vol.reset();
      fs.mkdirSync('/home/github', { recursive: true });
      fs.writeFileSync('/home/github/file.txt', 'test-token');

      await run();
      expect(core.getIDToken).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Assuming role with web identity token file');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('fails when force-skip-oidc is true but no alternative credentials provided', async () => {
      vi.mocked(core.getInput).mockImplementation(
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
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'force-skip-oidc': 'true',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');

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
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'force-skip-oidc': 'false',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();
      expect(core.getIDToken).toHaveBeenCalledWith('');
      expect(core.info).toHaveBeenCalledWith('Assuming role with OIDC');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('uses OIDC when force-skip-oidc is not set (default behavior)', async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();
      expect(core.getIDToken).toHaveBeenCalledWith('');
      expect(core.info).toHaveBeenCalledWith('Assuming role with OIDC');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('works with role chaining when force-skip-oidc is true', async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.EXISTING_ROLE_INPUTS,
          'force-skip-oidc': 'true',
          'aws-access-key-id': 'MYAWSACCESSKEYID',
          'aws-secret-access-key': 'MYAWSSECRETACCESSKEY',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
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
      vi.mocked(core.getInput).mockImplementation(
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
      vi.mocked(core.getInput).mockImplementation(
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
      vi.mocked(core.getInput).mockImplementation(
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
      vi.mocked(core.getInput).mockImplementation(
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
      vi.mocked(core.getInput).mockImplementation(
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
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'allowed-account-ids': '111111111111',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
    });

    it('handles GetCallerIdentity API failure gracefully', async () => {
      vi.mocked(core.getInput).mockImplementation(
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
      vi.mocked(core.getInput).mockImplementation(
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
      vi.mocked(core.getInput).mockImplementation(
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
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS));
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValueOnce({
        accessKeyId: 'MYAWSACCESSKEYID',
      });
    });

    it('sets timeout when action-timeout-s is provided', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const infoSpy = vi.mocked(core.info);
      vi.mocked(core.getInput).mockImplementation(
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
      const infoSpy = vi.mocked(core.info);
      vi.mocked(core.getInput).mockImplementation(
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
      const infoSpy = vi.mocked(core.info);

      await run();

      expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining('Setting a global timeout'));
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('timeout callback calls setFailed and exits process', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      vi.mocked(core.getInput).mockImplementation(
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

  describe('Custom STS Endpoint', {}, () => {
    it('passes sts-endpoint to the STS client', async () => {
      const client = new CredentialsClient({
        region: 'us-east-1',
        stsEndpoint: 'https://sts.custom.example.com',
        roleChaining: false,
      });
      const endpoint = await client.stsClient.config.endpoint();
      expect(endpoint).toMatchObject({ hostname: 'sts.custom.example.com', protocol: 'https:' });
    });

    it('does not override endpoint when sts-endpoint is not provided', () => {
      const client = new CredentialsClient({
        region: 'us-east-1',
        roleChaining: false,
      });
      expect(client.stsClient.config.endpoint).toBeUndefined();
    });

    it('works with http endpoints for local services', async () => {
      const client = new CredentialsClient({
        region: 'us-east-1',
        stsEndpoint: 'http://localhost:9000',
        roleChaining: false,
      });
      const endpoint = await client.stsClient.config.endpoint();
      expect(endpoint).toMatchObject({ hostname: 'localhost', protocol: 'http:', port: 9000 });
    });

    it('succeeds in a full action run with sts-endpoint input', async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'sts-endpoint': 'https://sts.custom.example.com',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();

      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Authenticated as assumedRoleId AROAFAKEASSUMEDROLEID');
    });
  });

  describe('HTTP Proxy Configuration', {}, () => {
    beforeEach(() => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(GetCallerIdentityCommand).resolvesOnce({ ...mocks.outputs.GET_CALLER_IDENTITY });
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolvesOnce(mocks.outputs.STS_CREDENTIALS);
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
    });

    it('configures proxy from http-proxy input', async () => {
      const infoSpy = vi.mocked(core.info);
      vi.mocked(core.getInput).mockImplementation(
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
      const infoSpy = vi.mocked(core.info);
      process.env.HTTP_PROXY = 'http://proxy.example.com:8080';

      await run();

      expect(infoSpy).toHaveBeenCalledWith('Configuring proxy handler for STS client');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('configures proxy from HTTPS_PROXY environment variable', async () => {
      const infoSpy = vi.mocked(core.info);
      process.env.HTTPS_PROXY = 'https://proxy.example.com:8080';

      await run();

      expect(infoSpy).toHaveBeenCalledWith('Configuring proxy handler for STS client');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('prioritizes http-proxy input over environment variables', async () => {
      const infoSpy = vi.mocked(core.info);
      process.env.HTTP_PROXY = 'http://env-proxy.example.com:8080';
      vi.mocked(core.getInput).mockImplementation(
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
      const infoSpy = vi.mocked(core.info);

      vi.mocked(core.getInput).mockImplementation(
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
      vi.mocked(core.getInput).mockImplementation(
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

  describe('AWS Profile Support', {}, () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockedSTSClient.reset();
      vol.reset();
    });

    it('writes profile files with OIDC authentication', async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'aws-profile': 'dev',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();

      // Verify credentials were NOT exported to environment variables
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_SESSION_TOKEN', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_PROFILE', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_REGION', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_DEFAULT_REGION', expect.anything());

      // Verify profile files were written
      expect(core.info).toHaveBeenCalledWith('Writing credentials to profile: dev');
      expect(core.info).toHaveBeenCalledWith('Writing config to profile: dev');
      expect(core.info).toHaveBeenCalledWith('✓ Successfully configured AWS profile: dev');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('writes profile files with IAM user credentials', async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'aws-profile': 'production',
        }),
      );
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });

      await run();

      // Verify credentials were NOT exported to environment variables
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_SESSION_TOKEN', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_PROFILE', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_REGION', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_DEFAULT_REGION', expect.anything());

      // Verify profile files were written
      expect(core.info).toHaveBeenCalledWith('Writing credentials to profile: production');
      expect(core.info).toHaveBeenCalledWith('Writing config to profile: production');
      expect(core.info).toHaveBeenCalledWith('✓ Successfully configured AWS profile: production');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('writes profile files with IAM user role assumption', async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_ASSUMEROLE_INPUTS,
          'aws-profile': 'assumed-role',
        }),
      );
      mockedSTSClient.on(AssumeRoleCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials')
        .mockResolvedValueOnce({ accessKeyId: 'MYAWSACCESSKEYID' })
        .mockResolvedValueOnce({ accessKeyId: 'STSAWSACCESSKEYID' });

      vi.spyOn(profileManager, 'writeProfileFiles');
      await run();

      // Verify credentials were NOT exported to environment variables
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_SESSION_TOKEN', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_PROFILE', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_REGION', expect.anything());
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_DEFAULT_REGION', expect.anything());

      // Verify profile files were written
      expect(core.info).toHaveBeenCalledWith('Writing credentials to profile: assumed-role');
      expect(core.info).toHaveBeenCalledWith('Writing config to profile: assumed-role');
      expect(core.info).toHaveBeenCalledWith('✓ Successfully configured AWS profile: assumed-role');

      // Verify profile files were written twice (first to write access key id and access key, second to write
      // actual session token after role assumption
      expect(profileManager.writeProfileFiles).toHaveBeenCalledTimes(2);

      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('respects output-env-credentials=true with profiles', async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'aws-profile': 'dev',
          'output-env-credentials': 'true',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();

      // verify that env vars were exported
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'STSAWSACCESSKEYID');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'STSAWSSECRETACCESSKEY');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', 'STSAWSSESSIONTOKEN');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_PROFILE', 'dev');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'fake-region-1');

      // Verify profile files were still written
      expect(core.info).toHaveBeenCalledWith('Writing credentials to profile: dev');
      expect(core.info).toHaveBeenCalledWith('Writing config to profile: dev');
      expect(core.info).toHaveBeenCalledWith('✓ Successfully configured AWS profile: dev');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('maintains backward compatibility when aws-profile is not specified', async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();

      // Verify credentials WERE exported to environment variables (backward compatibility)
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', 'STSAWSACCESSKEYID');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', 'STSAWSSECRETACCESSKEY');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', 'STSAWSSESSIONTOKEN');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', 'fake-region-1');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', 'fake-region-1');

      // Verify AWS_PROFILE was NOT exported
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_PROFILE', expect.anything());

      // Verify profile files were NOT written
      expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('Writing credentials to profile'));
      expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('✓ Successfully configured AWS profile:'));
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('handles default profile correctly', async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'aws-profile': 'default',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();

      // Verify profile files were written for 'default' profile
      expect(core.info).toHaveBeenCalledWith('Writing credentials to profile: default');
      expect(core.info).toHaveBeenCalledWith('Writing config to profile: default');
      expect(core.info).toHaveBeenCalledWith('✓ Successfully configured AWS profile: default');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('rejects invalid profile names with whitespace', async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.GH_OIDC_INPUTS,
          'aws-profile': 'invalid profile',
        }),
      );
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('whitespace'));
    });
  });

  describe('Retry Behavior', {}, () => {
    it('retries exportAccountId on transient GetCallerIdentity failure', async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS));
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockResolvedValue({
        accessKeyId: 'MYAWSACCESSKEYID',
      });
      mockedSTSClient
        .on(GetCallerIdentityCommand)
        .rejectsOnce(new Error('throttled'))
        .resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      await run();
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Retry exportAccountId'));
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('retries validateCredentials on transient loadCredentials failure', async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.IAM_USER_INPUTS));
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials')
        .mockRejectedValueOnce(new Error('network glitch'))
        .mockResolvedValue({ accessKeyId: 'MYAWSACCESSKEYID' });
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      await run();
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Retry validateCredentials'));
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('respects disable-retry for validateCredentials', async () => {
      vi.mocked(core.getInput).mockImplementation(
        mocks.getInput({
          ...mocks.IAM_USER_INPUTS,
          'disable-retry': 'true',
        }),
      );
      // biome-ignore lint/suspicious/noExplicitAny: any required to mock private method
      vi.spyOn(CredentialsClient.prototype as any, 'loadCredentials').mockRejectedValue(new Error('network glitch'));
      await run();
      expect(core.setFailed).toHaveBeenCalled();
      expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('Retry'));
    });

    it('retries exportAccountId after role assumption (issue #1681)', async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient
        .on(GetCallerIdentityCommand)
        .rejectsOnce(new Error('The security token included in the request is invalid'))
        .resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
      await run();
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Retry exportAccountId'));
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('The security token included in the request is invalid'),
      );
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('retries AssumeRole and shows info-level retry messages', async () => {
      vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.GH_OIDC_INPUTS));
      vi.mocked(core.getIDToken).mockResolvedValue('testoidctoken');
      mockedSTSClient
        .on(AssumeRoleWithWebIdentityCommand)
        .rejectsOnce(new Error('Rate exceeded'))
        .resolves(mocks.outputs.STS_CREDENTIALS);
      mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'fake-token';
      await run();
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Retry AssumeRole'));
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Rate exceeded'));
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });

  describe('User-Agent enrichment', {}, () => {
    async function getCustomUserAgent(): Promise<unknown> {
      const { CredentialsClient: FreshClient } = await import('../src/CredentialsClient');
      const client = new FreshClient({ region: 'fake-region-1', roleChaining: false });
      // biome-ignore lint/suspicious/noExplicitAny: SDK config readout
      return (client.stsClient.config as any).customUserAgent;
    }

    it('includes action, run_id and attempt tokens when env vars are valid', async () => {
      vi.resetModules();
      process.env.GITHUB_ACTION = '__run_2';
      process.env.GITHUB_RUN_ID = '16412345678';
      process.env.GITHUB_RUN_ATTEMPT = '1';
      const ua = await getCustomUserAgent();
      expect(ua).toEqual([
        ['configure-aws-credentials-for-github-actions'],
        ['md', 'action#__run_2'],
        ['md', 'run_id#16412345678'],
        ['md', 'attempt#1'],
      ]);
      expect(core.warning).not.toHaveBeenCalled();
    });

    it('omits tokens when env vars are unset, with no warning', async () => {
      vi.resetModules();
      delete process.env.GITHUB_ACTION;
      delete process.env.GITHUB_RUN_ID;
      delete process.env.GITHUB_RUN_ATTEMPT;
      const ua = await getCustomUserAgent();
      expect(ua).toEqual([['configure-aws-credentials-for-github-actions']]);
      expect(core.warning).not.toHaveBeenCalled();
    });

    it('warns and skips when env vars are malformed', async () => {
      vi.resetModules();
      process.env.GITHUB_ACTION = '$(curl evil)';
      process.env.GITHUB_RUN_ID = '$(curl evil)';
      process.env.GITHUB_RUN_ATTEMPT = '1; rm -rf /';
      const ua = await getCustomUserAgent();
      expect(ua).toEqual([['configure-aws-credentials-for-github-actions']]);
      expect(core.warning).toHaveBeenCalledWith('GITHUB_ACTION has unexpected format; omitting from User-Agent');
      expect(core.warning).toHaveBeenCalledWith('GITHUB_RUN_ID has unexpected format; omitting from User-Agent');
      expect(core.warning).toHaveBeenCalledWith('GITHUB_RUN_ATTEMPT has unexpected format; omitting from User-Agent');
      expect(core.warning).toHaveBeenCalledTimes(3);
    });

    it('warns and skips when env vars exceed the length bound', async () => {
      vi.resetModules();
      process.env.GITHUB_ACTION = 'a'.repeat(200);
      process.env.GITHUB_RUN_ID = '1'.repeat(50);
      process.env.GITHUB_RUN_ATTEMPT = '1'.repeat(50);
      const ua = await getCustomUserAgent();
      expect(ua).toEqual([['configure-aws-credentials-for-github-actions']]);
      expect(core.warning).toHaveBeenCalledTimes(3);
    });

    it('rejects GITHUB_ACTION containing whitespace or other characters', async () => {
      vi.resetModules();
      process.env.GITHUB_ACTION = 'has space';
      delete process.env.GITHUB_RUN_ID;
      delete process.env.GITHUB_RUN_ATTEMPT;
      const ua = await getCustomUserAgent();
      expect(ua).toEqual([['configure-aws-credentials-for-github-actions']]);
      expect(core.warning).toHaveBeenCalledWith('GITHUB_ACTION has unexpected format; omitting from User-Agent');
    });

    it('sets AWS_EXECUTION_ENV to GitHubActions when unset', async () => {
      vi.resetModules();
      await import('../src/CredentialsClient');
      expect(process.env.AWS_EXECUTION_ENV).toBe('GitHubActions');
    });

    it('preserves a pre-existing AWS_EXECUTION_ENV value', async () => {
      vi.resetModules();
      process.env.AWS_EXECUTION_ENV = 'CustomRunner';
      await import('../src/CredentialsClient');
      expect(process.env.AWS_EXECUTION_ENV).toBe('CustomRunner');
    });
  });
});
