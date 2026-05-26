import * as core from '@actions/core';
import { fs, vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as helpers from '../src/helpers';

vi.mock('node:fs');
vi.mock('@actions/core');

describe('Configure AWS Credentials helpers', {}, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vol.reset();
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
  it('retries and logs with label at info level', {}, async () => {
    helpers.withsleep(() => Promise.resolve());
    const fn = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce('success');
    const result = await helpers.retryAndBackoff(fn, true, 3, 0, 50, 'TestOp');
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Retry TestOp: attempt 1 of 3 failed'));
    helpers.reset();
  });
  it('logs max retries reached with label', {}, async () => {
    helpers.withsleep(() => Promise.resolve());
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));
    await expect(helpers.retryAndBackoff(fn, true, 2, 0, 50, 'TestOp')).rejects.toThrow('persistent');
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Retry TestOp: reached max retries (2)'));
    helpers.reset();
  });
  it('retries without a label (backward compat)', {}, async () => {
    helpers.withsleep(() => Promise.resolve());
    const fn = vi.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce('ok');
    await helpers.retryAndBackoff(fn, true, 3);
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Retry: attempt 1 of 3 failed'));
    helpers.reset();
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
    vi.spyOn(core, 'setSecret').mockImplementation(() => {});
    vi.spyOn(core, 'exportVariable').mockImplementation(() => {});
    process.env.AWS_SESSION_TOKEN = 'old-token';
    helpers.exportCredentials({ AccessKeyId: 'test', SecretAccessKey: 'test' }, false, true);
    expect(core.exportVariable).toHaveBeenCalledWith('AWS_SESSION_TOKEN', '');
  });

  describe('filesystem helpers', {}, () => {
    describe('isSymlink', {}, () => {
      it('returns true for a symlink', {}, () => {
        fs.mkdirSync('/dir', { recursive: true });
        fs.writeFileSync('/dir/target', 'data');
        fs.symlinkSync('/dir/target', '/dir/link');
        expect(helpers.isSymlink('/dir/link')).toBe(true);
      });

      it('returns false for a regular file', {}, () => {
        fs.mkdirSync('/dir', { recursive: true });
        fs.writeFileSync('/dir/file', 'data');
        expect(helpers.isSymlink('/dir/file')).toBe(false);
      });

      it('returns false for a missing path', {}, () => {
        expect(helpers.isSymlink('/nonexistent')).toBe(false);
      });
    });

    describe('readFileUtf8', {}, () => {
      it('returns content for a regular file', {}, () => {
        fs.mkdirSync('/dir', { recursive: true });
        fs.writeFileSync('/dir/file', 'hello');
        expect(helpers.readFileUtf8('/dir/file')).toBe('hello');
      });

      it('returns null when the file does not exist', {}, () => {
        fs.mkdirSync('/dir', { recursive: true });
        expect(helpers.readFileUtf8('/dir/missing')).toBe(null);
      });

      it('refuses to read through a symlink at the target', {}, () => {
        fs.mkdirSync('/dir', { recursive: true });
        fs.writeFileSync('/dir/secret', 'sensitive');
        fs.symlinkSync('/dir/secret', '/dir/link');
        expect(() => helpers.readFileUtf8('/dir/link')).toThrow(/Refusing .* \(.* symbolic link\)/);
      });

      it('refuses to read when the parent directory is a symlink', {}, () => {
        fs.mkdirSync('/real/.aws', { recursive: true });
        fs.writeFileSync('/real/.aws/credentials', 'data');
        fs.mkdirSync('/home', { recursive: true });
        fs.symlinkSync('/real/.aws', '/home/.aws');
        expect(() => helpers.readFileUtf8('/home/.aws/credentials')).toThrow(/Refusing .* \(.* symbolic link\)/);
      });

      it('refuses to read when the path is a directory', {}, () => {
        fs.mkdirSync('/dir/subdir', { recursive: true });
        expect(() => helpers.readFileUtf8('/dir/subdir')).toThrow(/not a regular file/);
      });

      it.skipIf(process.platform === 'win32')(
        'follows the kubelet projected-token symlink chain at /var/run/secrets/*/serviceaccount/token',
        () => {
          fs.mkdirSync('/var/run/secrets/eks.amazonaws.com/serviceaccount/..2026_05_28_00_00_00.123', {
            recursive: true,
          });
          fs.writeFileSync(
            '/var/run/secrets/eks.amazonaws.com/serviceaccount/..2026_05_28_00_00_00.123/token',
            'jwt-token',
          );
          fs.symlinkSync('..2026_05_28_00_00_00.123', '/var/run/secrets/eks.amazonaws.com/serviceaccount/..data');
          fs.symlinkSync('..data/token', '/var/run/secrets/eks.amazonaws.com/serviceaccount/token');
          expect(helpers.readFileUtf8('/var/run/secrets/eks.amazonaws.com/serviceaccount/token')).toBe('jwt-token');
        },
      );

      it.skipIf(process.platform === 'win32')('still refuses symlinks at lookalike paths outside the allowlist', () => {
        fs.mkdirSync('/var/run/secrets/eks.amazonaws.com/serviceaccount', { recursive: true });
        fs.writeFileSync('/var/run/secrets/eks.amazonaws.com/serviceaccount/secret', 'jwt-token');
        fs.symlinkSync(
          '/var/run/secrets/eks.amazonaws.com/serviceaccount/secret',
          '/var/run/secrets/eks.amazonaws.com/serviceaccount/token2',
        );
        expect(() => helpers.readFileUtf8('/var/run/secrets/eks.amazonaws.com/serviceaccount/token2')).toThrow(
          /Refusing .* \(.* symbolic link\)/,
        );
      });
    });

    describe('isAllowListed', {}, () => {
      it.skipIf(process.platform === 'win32')('matches the canonical kubelet projected-token path', () => {
        expect(helpers.isAllowListed('/var/run/secrets/eks.amazonaws.com/serviceaccount/token')).toBe(true);
        expect(helpers.isAllowListed('/var/run/secrets/kubernetes.io/serviceaccount/token')).toBe(true);
      });

      it.skipIf(process.platform === 'win32')('rejects nested or unrelated paths', () => {
        expect(helpers.isAllowListed('/var/run/secrets/serviceaccount/token')).toBe(false);
        expect(helpers.isAllowListed('/var/run/secrets/a/b/serviceaccount/token')).toBe(false);
        expect(helpers.isAllowListed('/var/run/secrets/eks.amazonaws.com/serviceaccount/token2')).toBe(false);
        expect(helpers.isAllowListed('/etc/var/run/secrets/foo/serviceaccount/token')).toBe(false);
      });

      it.skipIf(process.platform === 'win32')('normalizes path traversal attempts', () => {
        expect(helpers.isAllowListed('/var/run/secrets/foo/serviceaccount/../../../../etc/passwd')).toBe(false);
      });
    });

    describe('writeFileUtf8', {}, () => {
      it('writes content with the specified mode', {}, () => {
        fs.mkdirSync('/dir', { recursive: true });
        helpers.writeFileUtf8('/dir/file', 'payload', 0o600);
        expect(fs.readFileSync('/dir/file', 'utf-8')).toBe('payload');
        expect(fs.statSync('/dir/file').mode & 0o777).toBe(0o600);
      });

      it('refuses to follow a symlink at the target and leaves the target file untouched', {}, () => {
        fs.mkdirSync('/dir', { recursive: true });
        fs.writeFileSync('/dir/target', 'original');
        fs.symlinkSync('/dir/target', '/dir/link');
        expect(() => helpers.writeFileUtf8('/dir/link', 'attacker', 0o600)).toThrow(/Refusing .* \(.* symbolic link\)/);
        expect(fs.readFileSync('/dir/target', 'utf-8')).toBe('original');
      });

      it.skipIf(process.platform === 'win32')('tightens mode on existing files', () => {
        fs.mkdirSync('/dir', { recursive: true });
        fs.writeFileSync('/dir/file', 'old', { mode: 0o644 });
        helpers.writeFileUtf8('/dir/file', 'new', 0o600);
        expect(fs.statSync('/dir/file').mode & 0o777).toBe(0o600);
      });
    });

    describe('mkdir', {}, () => {
      it('is idempotent on a regular directory', {}, () => {
        helpers.mkdir('/some/nested/dir', 0o700);
        helpers.mkdir('/some/nested/dir', 0o700);
        expect(fs.statSync('/some/nested/dir').isDirectory()).toBe(true);
      });

      it('refuses when the target directory is a symlink', {}, () => {
        fs.mkdirSync('/real', { recursive: true });
        fs.mkdirSync('/home', { recursive: true });
        fs.symlinkSync('/real', '/home/.aws');
        expect(() => helpers.mkdir('/home/.aws', 0o700)).toThrow(/Refusing .* \(.* symbolic link\)/);
      });
    });
  });
});
