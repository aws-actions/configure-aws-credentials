import * as helpers from '../src/helpers';
describe('helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('removes brackets from GitHub Actor', () => {
    expect(helpers.sanitizeGitHubVariables('foo[bot]')).toEqual('foo_bot_');
  });

  test('removes special characters from worflow names', () => {
    expect(helpers.sanitizeGitHubVariables('sdf234@#$%$^&*()_+{}|:"<>?')).toEqual('sdf234@__________+___:_<>?');
  });

  test('can sleep', () => {
    const sleep = helpers.defaultSleep(10);
    expect(Promise.race([sleep, new Promise((_res, rej) => setTimeout(rej, 20))])).resolves;
  });

  test("backoff function doesn't retry non-retryable errors", async () => {
    const fn = jest.fn().mockRejectedValue('i am not retryable');
    await expect(helpers.retryAndBackoff(fn, false)).rejects.toMatch('i am not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
