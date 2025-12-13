import { beforeEach } from 'node:test';
import * as core from '@actions/core';
import { describe, expect, it, vi } from 'vitest';
import { fs, vol } from 'memfs';

const testTempDir = './.test-tmp';
const mockHomeDir = `${testTempDir}/home/testuser`;

// Mock node:fs to use memfs
vi.mock('node:fs', () => {
  return { default: fs, ...fs };
});

// Mock node:os to return predictable home directory
// This must be hoisted before any imports that use it
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    default: {
      ...actual.default,
      homedir: () => mockHomeDir,
    },
    homedir: () => mockHomeDir,
  };
});

import * as helpers from '../src/helpers';
import { clearAwsConfigFilePaths, createAwsConfigFiles } from '../src/awsConfigFiles';

describe('Configure AWS Credentials helpers', {}, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vol.reset();
    clearAwsConfigFilePaths();
    // Clean up test temp directory if it exists
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
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

  describe('AWS config files', {}, () => {
    beforeEach(() => {
      // Ensure clean state for each test in this describe block
      vol.reset();
      clearAwsConfigFilePaths();
    });

    it('creates config files when outputConfigFiles is enabled with default paths', {}, () => {
      vi.spyOn(core, 'debug').mockImplementation(() => {});
      vi.spyOn(core, 'info').mockImplementation(() => {});
      vi.spyOn(core, 'exportVariable').mockImplementation(() => {});
      vi.spyOn(core, 'setOutput').mockImplementation(() => {});

      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
        SessionToken: 'testsessiontoken123',
      };

      helpers.exportCredentials(testCredentials, false, false, true, 'us-east-1', undefined, undefined, 'default', false);

      // Check that files were created
      const configFile = `${mockHomeDir}/.aws/config`;
      const credentialsFile = `${mockHomeDir}/.aws/credentials`;
      expect(fs.existsSync(configFile)).toBe(true);
      expect(fs.existsSync(credentialsFile)).toBe(true);

      // Check that environment variables were set (even for default paths, we set them explicitly)
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_CONFIG_FILE', expect.stringContaining('.aws/config'));
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SHARED_CREDENTIALS_FILE', expect.stringContaining('.aws/credentials'));

      // Check that outputs were set
      expect(core.setOutput).toHaveBeenCalledWith('aws-config-file-path', expect.stringContaining('.aws/config'));
      expect(core.setOutput).toHaveBeenCalledWith(
        'aws-shared-credentials-file-path',
        expect.stringContaining('.aws/credentials'),
      );
      expect(core.setOutput).toHaveBeenCalledWith('aws-profile-name', 'default');

      // Check debug messages
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Successfully created AWS config file at'));
      expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Successfully created AWS shared credentials file at'));
    });

    it('creates config files with custom paths and sets environment variables', {}, () => {
      vi.spyOn(core, 'debug').mockImplementation(() => {});
      vi.spyOn(core, 'exportVariable').mockImplementation(() => {});
      vi.spyOn(core, 'setOutput').mockImplementation(() => {});

      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      const customConfigPath = `${testTempDir}/custom-config`;
      const customCredsPath = `${testTempDir}/custom-credentials`;
      const profileName = 'production';

      helpers.exportCredentials(
        testCredentials,
        false,
        false,
        true,
        'us-west-2',
        customConfigPath,
        customCredsPath,
        profileName,
        false,
      );

      // Check that files were created
      expect(fs.existsSync(customConfigPath)).toBe(true);
      expect(fs.existsSync(customCredsPath)).toBe(true);

      // Check that environment variables were set for custom paths
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_CONFIG_FILE', customConfigPath);
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SHARED_CREDENTIALS_FILE', customCredsPath);

      // Check that outputs were set
      expect(core.setOutput).toHaveBeenCalledWith('aws-config-file-path', customConfigPath);
      expect(core.setOutput).toHaveBeenCalledWith('aws-shared-credentials-file-path', customCredsPath);
      expect(core.setOutput).toHaveBeenCalledWith('aws-profile-name', profileName);
    });

    it('does not create config files when outputConfigFiles is false', {}, () => {
      vi.spyOn(core, 'debug').mockImplementation(() => {});

      // Remove any existing files first
      const configFile = `${mockHomeDir}/.aws/config`;
      const credentialsFile = `${mockHomeDir}/.aws/credentials`;
      if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
      }
      if (fs.existsSync(credentialsFile)) {
        fs.unlinkSync(credentialsFile);
      }

      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      helpers.exportCredentials(testCredentials, false, false, false, 'us-east-1');

      // Check that files were NOT created
      expect(fs.existsSync(configFile)).toBe(false);
      expect(fs.existsSync(credentialsFile)).toBe(false);
    });

    it('does not create config files when credentials are incomplete', {}, () => {
      vi.spyOn(core, 'debug').mockImplementation(() => {});

      // Store initial state
      const configFile = `${mockHomeDir}/.aws/config`;
      const credentialsFile = `${mockHomeDir}/.aws/credentials`;
      const configExistedBefore = fs.existsSync(configFile);
      const credsExistedBefore = fs.existsSync(credentialsFile);
      let configContentBefore = '';
      let credsContentBefore = '';
      if (configExistedBefore) {
        configContentBefore = fs.readFileSync(configFile, 'utf-8');
      }
      if (credsExistedBefore) {
        credsContentBefore = fs.readFileSync(credentialsFile, 'utf-8');
      }

      // Missing SecretAccessKey - should not create files
      helpers.exportCredentials({ AccessKeyId: 'AKIATEST123' }, false, false, true, 'us-east-1', undefined, undefined, undefined, false);

      // Files should not be created or modified when credentials are incomplete
      if (!configExistedBefore) {
        expect(fs.existsSync(configFile)).toBe(false);
      } else {
        // If file existed, content should be unchanged
        const configContentAfter = fs.readFileSync(configFile, 'utf-8');
        expect(configContentAfter).toBe(configContentBefore);
      }
      if (!credsExistedBefore) {
        expect(fs.existsSync(credentialsFile)).toBe(false);
      } else {
        const credsContentAfter = fs.readFileSync(credentialsFile, 'utf-8');
        expect(credsContentAfter).toBe(credsContentBefore);
      }
    });

    it('sets outputs for config file paths and profile name when creating config files', {}, () => {
      vi.spyOn(core, 'setOutput').mockImplementation(() => {});
      vi.spyOn(core, 'debug').mockImplementation(() => {});

      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      const customConfigPath = `${testTempDir}/test-config`;
      const customCredsPath = `${testTempDir}/test-credentials`;
      const profileName = 'test-profile';

      helpers.exportCredentials(
        testCredentials,
        false,
        false,
        true,
        'us-east-1',
        customConfigPath,
        customCredsPath,
        profileName,
        false,
      );

      expect(core.setOutput).toHaveBeenCalledWith('aws-config-file-path', expect.stringContaining('test-config'));
      expect(core.setOutput).toHaveBeenCalledWith(
        'aws-shared-credentials-file-path',
        expect.stringContaining('test-credentials'),
      );
      expect(core.setOutput).toHaveBeenCalledWith('aws-profile-name', profileName);
    });

    it('sets outputs for default paths when using default config file locations', {}, () => {
      vi.spyOn(core, 'setOutput').mockImplementation(() => {});
      vi.spyOn(core, 'debug').mockImplementation(() => {});

      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      helpers.exportCredentials(testCredentials, false, false, true, 'us-east-1', undefined, undefined, 'default', false);

      expect(core.setOutput).toHaveBeenCalledWith('aws-config-file-path', expect.stringContaining('.aws/config'));
      expect(core.setOutput).toHaveBeenCalledWith(
        'aws-shared-credentials-file-path',
        expect.stringContaining('.aws/credentials'),
      );
      expect(core.setOutput).toHaveBeenCalledWith('aws-profile-name', 'default');
    });

    it('handles errors when creating config files gracefully', {}, async () => {
      vi.spyOn(core, 'warning').mockImplementation(() => {});
      vi.spyOn(core, 'debug').mockImplementation(() => {});
      vi.spyOn(core, 'setOutput').mockImplementation(() => {});

      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      // Import the module to spy on it
      const awsConfigFilesModule = await import('../src/awsConfigFiles');
      const createAwsConfigFilesSpy = vi
        .spyOn(awsConfigFilesModule, 'createAwsConfigFiles')
        .mockImplementationOnce(() => {
          throw new Error('Permission denied');
        });

      helpers.exportCredentials(testCredentials, false, false, true, 'us-east-1', undefined, undefined, undefined, false);

      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to create AWS config files'));
      // Outputs should not be set if file creation fails
      expect(core.setOutput).not.toHaveBeenCalledWith('aws-config-file-path', expect.anything());
      expect(core.setOutput).not.toHaveBeenCalledWith('aws-shared-credentials-file-path', expect.anything());
      expect(core.setOutput).not.toHaveBeenCalledWith('aws-profile-name', expect.anything());

      createAwsConfigFilesSpy.mockRestore();
    });

    it('cleans up custom config files in unsetCredentials', {}, () => {
      vi.spyOn(core, 'exportVariable').mockImplementation(() => {});
      vi.spyOn(core, 'debug').mockImplementation(() => {});

      // First create files with custom paths
      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      helpers.exportCredentials(
        testCredentials,
        false,
        false,
        true,
        'us-east-1',
        `${testTempDir}/test-config`,
        `${testTempDir}/test-credentials`,
      );

      // Verify files exist
      expect(fs.existsSync(`${testTempDir}/test-config`)).toBe(true);
      expect(fs.existsSync(`${testTempDir}/test-credentials`)).toBe(true);

      // Now unset credentials
      helpers.unsetCredentials(false);

      // Check that files were removed
      expect(fs.existsSync(`${testTempDir}/test-config`)).toBe(false);
      expect(fs.existsSync(`${testTempDir}/test-credentials`)).toBe(false);

      // Check that environment variables were unset
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_CONFIG_FILE', '');
      expect(core.exportVariable).toHaveBeenCalledWith('AWS_SHARED_CREDENTIALS_FILE', '');
    });

    it('does not clean up default config files in unsetCredentials', {}, () => {
      vi.spyOn(core, 'exportVariable').mockImplementation(() => {});

      // Create files with default paths
      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      helpers.exportCredentials(testCredentials, false, false, true, 'us-east-1', undefined, undefined, undefined, false);

      const configFile = `${mockHomeDir}/.aws/config`;
      const credentialsFile = `${mockHomeDir}/.aws/credentials`;

      // Verify files exist
      expect(fs.existsSync(configFile)).toBe(true);
      expect(fs.existsSync(credentialsFile)).toBe(true);

      // Now unset credentials
      helpers.unsetCredentials(false);

      // Check that files were NOT removed (default paths are preserved)
      expect(fs.existsSync(configFile)).toBe(true);
      expect(fs.existsSync(credentialsFile)).toBe(true);

      // Check that environment variables were NOT unset (they were never set)
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_CONFIG_FILE', '');
      expect(core.exportVariable).not.toHaveBeenCalledWith('AWS_SHARED_CREDENTIALS_FILE', '');
    });

    it('uses custom profile name when provided', {}, () => {
      vi.spyOn(core, 'debug').mockImplementation(() => {});
      vi.spyOn(core, 'info').mockImplementation(() => {});

      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      helpers.exportCredentials(testCredentials, false, false, true, 'us-east-1', undefined, undefined, 'production', false);

      const configFile = `${mockHomeDir}/.aws/config`;
      expect(fs.existsSync(configFile)).toBe(true);
      const configContent = fs.readFileSync(configFile, 'utf-8');
      expect(configContent).toContain('[profile production]');
    });
  });
});
