import * as core from '@actions/core';
import { AssumeRoleWithWebIdentityCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { fs, vol } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as helpers from '../src/helpers';
import { run } from '../src/index';
import mocks from './mockinputs.test';

vi.mock('node:fs');
vi.mock('@actions/core');

const mockedSTSClient = mockClient(STSClient);

describe('assumeRoleWithWebIdentityTokenFile', {}, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockedSTSClient.reset();
    vol.reset();
    helpers.withsleep(() => Promise.resolve());
    vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.WEBIDENTITY_TOKEN_FILE_INPUTS));
    vi.mocked(core.getMultilineInput).mockReturnValue([]);
    mockedSTSClient.on(GetCallerIdentityCommand).resolves({ ...mocks.outputs.GET_CALLER_IDENTITY });
    process.env = { ...mocks.envs };
    fs.mkdirSync('/home/github', { recursive: true });
  });

  afterEach(() => {
    helpers.reset();
  });

  it('refuses when the token file is a symlink and never calls STS', async () => {
    fs.mkdirSync('/etc', { recursive: true });
    fs.writeFileSync('/etc/passwd', 'root:x:0:0::/root:/bin/sh');
    fs.symlinkSync('/etc/passwd', '/home/github/file.txt');

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringMatching(/Refusing .* \(.* symbolic link\)/));
    expect(mockedSTSClient.commandCalls(AssumeRoleWithWebIdentityCommand)).toHaveLength(0);
    expect(fs.readFileSync('/etc/passwd', 'utf-8')).toBe('root:x:0:0::/root:/bin/sh');
  });

  it('preserves the existing missing-file error when the token file does not exist', async () => {
    await run();

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Web identity token file does not exist'));
    expect(mockedSTSClient.commandCalls(AssumeRoleWithWebIdentityCommand)).toHaveLength(0);
  });

  it('passes token contents to STS when the file is regular', async () => {
    fs.writeFileSync('/home/github/file.txt', 'real-token');
    mockedSTSClient.on(AssumeRoleWithWebIdentityCommand).resolves(mocks.outputs.STS_CREDENTIALS);

    await run();

    expect(core.setFailed).not.toHaveBeenCalled();
    const calls = mockedSTSClient.commandCalls(AssumeRoleWithWebIdentityCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input.WebIdentityToken).toBe('real-token');
  });
});
