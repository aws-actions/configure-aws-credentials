import * as core from '@actions/core';
import { STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '../src/cleanup';
import mocks from './mockinputs.test';

const mockedSTSClient = mockClient(STSClient);

describe('Configure AWS Credentials cleanup', {}, () => {
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
    expect(core.exportVariable).toHaveBeenCalledTimes(6);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_ACCESS_KEY_ID', '');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_SECRET_ACCESS_KEY', '');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', '');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_DEFAULT_REGION', '');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_REGION', '');
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_PROFILE', '');
  });
  it('handles errors', {}, () => {
    vi.spyOn(core, 'exportVariable').mockImplementationOnce(() => {
      throw new Error('Test error');
    });
    cleanup();
    expect(core.setFailed).toHaveBeenCalled();
  });
  it(`doesn't export credentials as empty env variables if asked not to`, {}, () => {
    vi.spyOn(core, 'getInput').mockImplementation(mocks.getInput(mocks.NO_ENV_CREDS_INPUTS));
    cleanup();
    expect(core.exportVariable).toHaveBeenCalledTimes(0);
  });
});
