import { beforeEach } from 'node:test';
import * as core from '@actions/core';
import { describe, expect, it, vi } from 'vitest';
import * as helpers from '../src/helpers';

describe('Configure AWS Credentials helpers', {}, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  it('removes brackets from GitHub Actor', {}, () => {
    const actor = 'actor[bot]';
    expect(helpers.sanitizeGitHubVariables(actor)).toBe('actor_bot_');
  });
  it('can sleep', {}, async () => {
    const sleep = helpers.defaultSleep(10);
    await expect(Promise.race([sleep, new Promise((_, reject) => setTimeout(reject, 20))])).resolves.toBe(undefined);
  });
  it('removes special characters from workflow names', {}, () => {
    expect(helpers.sanitizeGitHubVariables('sdf234@#$%$^&*()_+{}|:"<>?')).toEqual('sdf234@__________+___:____');
  });
  it("doesn't retry non-retryable errors", {}, async () => {
    const fn = vi.fn().mockRejectedValue('i am not retryable');
    await expect(helpers.retryAndBackoff(fn, false)).rejects.toMatch('i am not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('can output creds when told to', {}, () => {
    vi.spyOn(core, 'setOutput').mockImplementation(() => {});
    vi.spyOn(core, 'setSecret').mockImplementation(() => {});
    vi.spyOn(core, 'exportVariable').mockImplementation(() => {});
    helpers.exportCredentials(
      { AccessKeyId: 'test', SecretAccessKey: 'test', SessionToken: 'test', Expiration: new Date(8640000000000000) },
      true,
      true,
    );
    expect(core.setOutput).toHaveBeenCalledTimes(4);
    expect(core.setSecret).toHaveBeenCalledTimes(3);
    expect(core.exportVariable).toHaveBeenCalledTimes(3);
  });
  it('can unset credentials', {}, () => {
    const env = process.env;
    helpers.unsetCredentials();
    expect(process.env.AWS_ACCESS_KEY_ID).toBeUndefined;
    expect(process.env.AWS_SECRET_ACCESS_KEY).toBeUndefined;
    expect(process.env.AWS_SESSION_TOKEN).toBeUndefined;
    expect(process.env.AWS_REGION).toBeUndefined;
    expect(process.env.AWS_DEFAULT_REGION).toBeUndefined;
    process.env = env;
  });
  it(`won't output credentials to env if told not to`, {}, () => {
    vi.spyOn(core, 'setOutput').mockImplementation(() => {});
    vi.spyOn(core, 'setSecret').mockImplementation(() => {});
    vi.spyOn(core, 'exportVariable').mockImplementation(() => {});
    helpers.exportCredentials(
      { AccessKeyId: 'test', SecretAccessKey: 'test', SessionToken: 'test', Expiration: new Date(8640000000000000) },
      true,
      false,
    );
    helpers.unsetCredentials(false);
    helpers.exportRegion('fake-test-region', false);
    expect(core.setOutput).toHaveBeenCalledTimes(4);
    expect(core.setSecret).toHaveBeenCalledTimes(3);
    expect(core.exportVariable).toHaveBeenCalledTimes(0);
  });

  it('verifies credentials without special characters', {}, () => {
    expect(helpers.verifyKeys({ AccessKeyId: 'AKIATEST', SecretAccessKey: 'secretkey' })).toBe(true);
    expect(helpers.verifyKeys({ AccessKeyId: 'AKIA!@#$', SecretAccessKey: 'secret' })).toBe(false);
    expect(helpers.verifyKeys(undefined)).toBe(false);
  });

  it('translates environment variables', {}, () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.HTTPS_PROXY = 'https://proxy:8080';
    helpers.translateEnvVariables();
    expect(process.env['INPUT_AWS-REGION']).toBe('us-east-1');
    expect(process.env.HTTP_PROXY).toBe('https://proxy:8080');
  });

  it('handles getBooleanInput correctly', {}, () => {
    vi.spyOn(core, 'getInput').mockReturnValue('true');
    expect(helpers.getBooleanInput('test')).toBe(true);
    
    vi.spyOn(core, 'getInput').mockReturnValue('false');
    expect(helpers.getBooleanInput('test')).toBe(false);
    
    vi.spyOn(core, 'getInput').mockReturnValue('');
    expect(helpers.getBooleanInput('test', { default: true })).toBe(true);
    
    vi.spyOn(core, 'getInput').mockReturnValue('invalid');
    expect(() => helpers.getBooleanInput('test')).toThrow();
  });

  it('clears session token when not provided', {}, () => {
    vi.spyOn(core, 'exportVariable').mockImplementation(() => {});
    process.env.AWS_SESSION_TOKEN = 'old-token';
    helpers.exportCredentials({ AccessKeyId: 'test', SecretAccessKey: 'test' }, false, true);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', '');
  });
});
