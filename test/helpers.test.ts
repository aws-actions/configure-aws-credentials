import { describe, it, expect, vi } from 'vitest';
import * as helpers from '../src/helpers';
import * as core from '@actions/core';
import { before, beforeEach } from 'node:test';

describe('Configure AWS Credentials helpers', {}, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  it('removes brackets from GitHub Actor', {}, () => {
    const actor = 'actor[bot]';
    expect(helpers.sanitizeGitHubVariables(actor)).toBe('actor_bot_');
  });
  it('can sleep', async () => {
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
    helpers.exportCredentials({ AccessKeyId: 'test', SecretAccessKey: 'test', SessionToken: 'test' }, true);
    expect(core.setOutput).toHaveBeenCalledTimes(3);
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
});
