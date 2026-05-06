import * as core from '@actions/core';
import { STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '../src/cleanup';
import mocks from './mockinputs.test';

vi.mock('@actions/core');

const mockedSTSClient = mockClient(STSClient);

describe('Configure AWS Credentials cleanup', {}, () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedSTSClient.reset();
    vi.mocked(core.getInput).mockReturnValue('');
    process.env = {
      ...mocks.envs,
      AWS_ACCESS_KEY_ID: 'CLEANUPTEST',
      AWS_SECRET_ACCESS_KEY: 'CLEANUPTEST',
      AWS_SESSION_TOKEN: 'CLEANUPTEST',
      AWS_REGION: 'CLEANUPTEST',
      AWS_DEFAULT_REGION: 'CLEANUPTEST',
    };
  });
  it('replaces AWS credential and region environment variables with empty strings', {}, () => {
    cleanup();
    expect(core.setFailed).toHaveBeenCalledTimes(0);
    expect(core.exportVariable).toHaveBeenCalledTimes(5);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', '');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', '');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', '');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', '');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', '');
  });
  it('also clears AWS_PROFILE when aws-profile was set', {}, () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'aws-profile') return 'my-profile';
      if (name === 'output-env-credentials') return 'true';
      return '';
    });
    cleanup();
    expect(core.setFailed).toHaveBeenCalledTimes(0);
    expect(core.exportVariable).toHaveBeenCalledTimes(6);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_PROFILE', '');
  });
  it('skips env cleanup when aws-profile is set without output-env-credentials', {}, () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      if (name === 'aws-profile') return 'my-profile';
      return '';
    });
    cleanup();
    expect(core.setFailed).toHaveBeenCalledTimes(0);
    expect(core.exportVariable).toHaveBeenCalledTimes(0);
  });
  it('handles errors', {}, () => {
    vi.mocked(core.exportVariable).mockImplementationOnce(() => {
      throw new Error('Test error');
    });
    cleanup();
    expect(core.setFailed).toHaveBeenCalled();
  });
  it(`doesn't export credentials as empty env variables if asked not to`, {}, () => {
    vi.mocked(core.getInput).mockImplementation(mocks.getInput(mocks.NO_ENV_CREDS_INPUTS));
    cleanup();
    expect(core.exportVariable).toHaveBeenCalledTimes(0);
  });
});
