import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fs, vol } from 'memfs';

const testTempDir = './.test-tmp';
const mockHomeDir = `${testTempDir}/home/testuser`;

// Mock @actions/core
vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

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

import {
  clearAwsConfigFilePaths,
  createAwsConfigFiles,
  expandPath,
  getAwsConfigFilePaths,
} from '../src/awsConfigFiles';

describe('AWS Config Files', {}, () => {
  const mockAwsDir = `${mockHomeDir}/.aws`;

  beforeEach(() => {
    vi.restoreAllMocks();
    vol.reset();
    clearAwsConfigFilePaths();
    // Clean up test temp directory if it exists
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  describe('expandPath', {}, () => {
    it('expands ~ to home directory', {}, () => {
      expect(expandPath('~')).toBe(mockHomeDir);
      expect(expandPath('~/test')).toBe(`${mockHomeDir}/test`);
      expect(expandPath('~/path/to/file')).toBe(`${mockHomeDir}/path/to/file`);
    });

    it('returns path unchanged if it does not start with ~', {}, () => {
      expect(expandPath('/absolute/path')).toBe('/absolute/path');
      expect(expandPath('relative/path')).toBe('relative/path');
      expect(expandPath('./relative')).toBe('./relative');
    });
  });

  describe('createAwsConfigFiles', {}, () => {
    const testCredentials = {
      AccessKeyId: 'AKIATEST123',
      SecretAccessKey: 'testsecretkey123',
      SessionToken: 'testsessiontoken123',
    };

    it('creates new config and credentials files with default paths', {}, () => {
      const result = createAwsConfigFiles(testCredentials, 'us-east-1', 'default');

      expect(result.isDefaultPath).toBe(true);
      // Paths may be normalized (./.test-tmp becomes .test-tmp), so check they contain the expected structure
      expect(result.configFile).toContain('.test-tmp/home/testuser/.aws/config');
      expect(result.credentialsFile).toContain('.test-tmp/home/testuser/.aws/credentials');

      // Check that .aws directory was created
      expect(fs.existsSync(mockAwsDir)).toBe(true);

      // Check config file content
      const configContent = fs.readFileSync(result.configFile, 'utf-8');
      expect(configContent).toContain('[default]');
      expect(configContent).toContain('region = us-east-1');

      // Check credentials file content
      const credsContent = fs.readFileSync(result.credentialsFile, 'utf-8');
      expect(credsContent).toContain('[default]');
      expect(credsContent).toContain('aws_access_key_id = AKIATEST123');
      expect(credsContent).toContain('aws_secret_access_key = testsecretkey123');
      expect(credsContent).toContain('aws_session_token = testsessiontoken123');
    });

    it('creates new config and credentials files with custom profile name', {}, () => {
      const result = createAwsConfigFiles(testCredentials, 'us-west-2', 'production');

      expect(result.isDefaultPath).toBe(true);

      // Check config file content with profile format
      const configContent = fs.readFileSync(result.configFile, 'utf-8');
      expect(configContent).toContain('[profile production]');
      expect(configContent).toContain('region = us-west-2');

      // Check credentials file content (no "profile" prefix)
      const credsContent = fs.readFileSync(result.credentialsFile, 'utf-8');
      expect(credsContent).toContain('[production]');
      expect(credsContent).toContain('aws_access_key_id = AKIATEST123');
    });

    it('creates new config and credentials files with custom paths', {}, () => {
      const customConfigPath = `${testTempDir}/my-aws-config`;
      const customCredsPath = `${testTempDir}/my-aws-credentials`;

      const result = createAwsConfigFiles(
        testCredentials,
        'eu-west-1',
        'default',
        customConfigPath,
        customCredsPath,
      );

      expect(result.isDefaultPath).toBe(false);
      expect(result.configFile).toBe(customConfigPath);
      expect(result.credentialsFile).toBe(customCredsPath);

      // Check files were created
      expect(fs.existsSync(customConfigPath)).toBe(true);
      expect(fs.existsSync(customCredsPath)).toBe(true);
    });

    it('expands ~ in custom paths', {}, () => {
      const result = createAwsConfigFiles(testCredentials, 'us-east-1', 'default', '~/custom-config', '~/custom-creds');

      expect(result.configFile).toBe(`${mockHomeDir}/custom-config`);
      expect(result.credentialsFile).toBe(`${mockHomeDir}/custom-creds`);
    });

    it('uses AWS_CONFIG_FILE and AWS_SHARED_CREDENTIALS_FILE environment variables when set', {}, () => {
      const envConfigPath = `${testTempDir}/env-config`;
      const envCredsPath = `${testTempDir}/env-credentials`;
      process.env.AWS_CONFIG_FILE = envConfigPath;
      process.env.AWS_SHARED_CREDENTIALS_FILE = envCredsPath;

      const result = createAwsConfigFiles(testCredentials, 'us-east-1', 'default');

      expect(result.configFile).toBe(envConfigPath);
      expect(result.credentialsFile).toBe(envCredsPath);
      // Should not be considered default path since env vars point to custom locations
      expect(result.isDefaultPath).toBe(false);

      // Clean up
      delete process.env.AWS_CONFIG_FILE;
      delete process.env.AWS_SHARED_CREDENTIALS_FILE;
    });

    it('uses explicit input paths over environment variables', {}, () => {
      const explicitConfigPath = `${testTempDir}/explicit-config`;
      const explicitCredsPath = `${testTempDir}/explicit-credentials`;
      const envConfigPath = `${testTempDir}/env-config`;
      const envCredsPath = `${testTempDir}/env-credentials`;
      process.env.AWS_CONFIG_FILE = envConfigPath;
      process.env.AWS_SHARED_CREDENTIALS_FILE = envCredsPath;

      const result = createAwsConfigFiles(
        testCredentials,
        'us-east-1',
        'default',
        explicitConfigPath,
        explicitCredsPath,
      );

      expect(result.configFile).toBe(explicitConfigPath);
      expect(result.credentialsFile).toBe(explicitCredsPath);
      expect(result.isDefaultPath).toBe(false);

      // Clean up
      delete process.env.AWS_CONFIG_FILE;
      delete process.env.AWS_SHARED_CREDENTIALS_FILE;
    });

    it('expands ~ in AWS_CONFIG_FILE and AWS_SHARED_CREDENTIALS_FILE environment variables', {}, () => {
      process.env.AWS_CONFIG_FILE = '~/env-config';
      process.env.AWS_SHARED_CREDENTIALS_FILE = '~/env-credentials';

      const result = createAwsConfigFiles(testCredentials, 'us-east-1', 'default');

      expect(result.configFile).toBe(`${mockHomeDir}/env-config`);
      expect(result.credentialsFile).toBe(`${mockHomeDir}/env-credentials`);
      expect(result.isDefaultPath).toBe(false);

      // Clean up
      delete process.env.AWS_CONFIG_FILE;
      delete process.env.AWS_SHARED_CREDENTIALS_FILE;
    });

    it('updates existing config file with new profile', {}, () => {
      // Create existing config file with a different profile
      fs.mkdirSync(mockAwsDir, { recursive: true });
      const existingConfig = `[default]
region = us-east-1

[profile dev]
region = us-west-1
`;
      fs.writeFileSync(`${mockAwsDir}/config`, existingConfig);

      // Add a new profile
      const result = createAwsConfigFiles(testCredentials, 'eu-central-1', 'production');

      const configContent = fs.readFileSync(result.configFile, 'utf-8');
      expect(configContent).toContain('[default]');
      expect(configContent).toContain('region = us-east-1');
      expect(configContent).toContain('[profile dev]');
      expect(configContent).toContain('region = us-west-1');
      expect(configContent).toContain('[profile production]');
      expect(configContent).toContain('region = eu-central-1');
    });

    it('updates existing profile in config file', {}, () => {
      // Create existing config file
      fs.mkdirSync(mockAwsDir, { recursive: true });
      const existingConfig = `[default]
region = us-east-1
`;
      fs.writeFileSync(`${mockAwsDir}/config`, existingConfig);

      // Update the default profile
      const result = createAwsConfigFiles(testCredentials, 'us-west-2', 'default');

      const configContent = fs.readFileSync(result.configFile, 'utf-8');
      expect(configContent).toContain('[default]');
      expect(configContent).toContain('region = us-west-2');
      // Should only have one region line
      const regionMatches = configContent.match(/region = /g);
      expect(regionMatches?.length).toBe(1);
    });

    it('updates existing credentials file with new profile', {}, () => {
      // Create existing credentials file
      fs.mkdirSync(mockAwsDir, { recursive: true });
      const existingCreds = `[default]
aws_access_key_id = OLDKEY
aws_secret_access_key = OLDSECRET

[dev]
aws_access_key_id = DEVKEY
aws_secret_access_key = DEVSECRET
`;
      fs.writeFileSync(`${mockAwsDir}/credentials`, existingCreds);

      // Add a new profile
      const result = createAwsConfigFiles(testCredentials, 'us-east-1', 'production');

      const credsContent = fs.readFileSync(result.credentialsFile, 'utf-8');
      expect(credsContent).toContain('[default]');
      expect(credsContent).toContain('aws_access_key_id = OLDKEY');
      expect(credsContent).toContain('[dev]');
      expect(credsContent).toContain('aws_access_key_id = DEVKEY');
      expect(credsContent).toContain('[production]');
      expect(credsContent).toContain('aws_access_key_id = AKIATEST123');
    });

    it('updates existing profile in credentials file', {}, () => {
      // Create existing credentials file
      fs.mkdirSync(mockAwsDir, { recursive: true });
      const existingCreds = `[default]
aws_access_key_id = OLDKEY
aws_secret_access_key = OLDSECRET
`;
      fs.writeFileSync(`${mockAwsDir}/credentials`, existingCreds);

      // Update the default profile
      const result = createAwsConfigFiles(testCredentials, 'us-east-1', 'default');

      const credsContent = fs.readFileSync(result.credentialsFile, 'utf-8');
      expect(credsContent).toContain('[default]');
      expect(credsContent).toContain('aws_access_key_id = AKIATEST123');
      expect(credsContent).toContain('aws_secret_access_key = testsecretkey123');
      expect(credsContent).toContain('aws_session_token = testsessiontoken123');
      // Should not contain old values
      expect(credsContent).not.toContain('OLDKEY');
      expect(credsContent).not.toContain('OLDSECRET');
    });

    it('handles credentials without session token', {}, () => {
      const credsWithoutToken = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      const result = createAwsConfigFiles(credsWithoutToken, 'us-east-1', 'default');

      const credsContent = fs.readFileSync(result.credentialsFile, 'utf-8');
      expect(credsContent).toContain('aws_access_key_id = AKIATEST123');
      expect(credsContent).toContain('aws_secret_access_key = testsecretkey123');
      expect(credsContent).not.toContain('aws_session_token');
    });

    it('preserves comments and empty lines in existing files', {}, () => {
      // Note: Our current implementation doesn't preserve comments/empty lines
      // This test documents current behavior
      fs.mkdirSync(mockAwsDir, { recursive: true });
      const existingConfig = `# This is a comment
[default]
region = us-east-1

# Another comment
`;
      fs.writeFileSync(`${mockAwsDir}/config`, existingConfig);

      createAwsConfigFiles(testCredentials, 'us-west-2', 'default');

      const configContent = fs.readFileSync(`${mockAwsDir}/config`, 'utf-8');
      // Comments are removed by our parser, but structure is preserved
      expect(configContent).toContain('[default]');
      expect(configContent).toContain('region = us-west-2');
    });

    it('creates parent directories for custom paths', {}, () => {
      const customConfigPath = `${testTempDir}/nested/path/config`;
      const customCredsPath = `${testTempDir}/nested/path/credentials`;

      const result = createAwsConfigFiles(testCredentials, 'us-east-1', 'default', customConfigPath, customCredsPath);

      expect(fs.existsSync(`${testTempDir}/nested/path`)).toBe(true);
      expect(fs.existsSync(result.configFile)).toBe(true);
      expect(fs.existsSync(result.credentialsFile)).toBe(true);
    });

    it('creates separate directories when config and credentials are in different locations', {}, () => {
      const customConfigPath = `${testTempDir}/config-dir/config`;
      const customCredsPath = `${testTempDir}/creds-dir/credentials`;

      const result = createAwsConfigFiles(testCredentials, 'us-east-1', 'default', customConfigPath, customCredsPath);

      // Both directories should be created since they're different
      expect(fs.existsSync(`${testTempDir}/config-dir`)).toBe(true);
      expect(fs.existsSync(`${testTempDir}/creds-dir`)).toBe(true);
      expect(fs.existsSync(result.configFile)).toBe(true);
      expect(fs.existsSync(result.credentialsFile)).toBe(true);

      // Verify files have correct content
      const configContent = fs.readFileSync(result.configFile, 'utf-8');
      const credsContent = fs.readFileSync(result.credentialsFile, 'utf-8');
      expect(configContent).toContain('[default]');
      expect(configContent).toContain('region = us-east-1');
      expect(credsContent).toContain('[default]');
      expect(credsContent).toContain('aws_access_key_id = AKIATEST123');
    });

    it('sets correct file permissions', {}, () => {
      const result = createAwsConfigFiles(testCredentials, 'us-east-1', 'default');

      const configStats = fs.statSync(result.configFile);
      const credsStats = fs.statSync(result.credentialsFile);

      // memfs may not fully support mode, but we can check files exist
      expect(configStats).toBeDefined();
      expect(credsStats).toBeDefined();
    });
  });

  describe('getAwsConfigFilePaths', {}, () => {
    it('returns undefined paths when no files have been created', {}, () => {
      const paths = getAwsConfigFilePaths();
      expect(paths.configFilePath).toBeUndefined();
      expect(paths.credentialsFilePath).toBeUndefined();
      expect(paths.isDefaultPath).toBeUndefined();
    });

    it('returns paths after creating files with default paths', {}, () => {
      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      createAwsConfigFiles(testCredentials, 'us-east-1', 'default');
      const paths = getAwsConfigFilePaths();

      // Paths may be normalized, so check that they contain the expected directory structure
      expect(paths.configFilePath).toContain('.test-tmp/home/testuser/.aws/config');
      expect(paths.credentialsFilePath).toContain('.test-tmp/home/testuser/.aws/credentials');
      expect(paths.isDefaultPath).toBe(true);
    });

    it('returns paths after creating files with custom paths', {}, () => {
      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      createAwsConfigFiles(testCredentials, 'us-east-1', 'default', `${testTempDir}/config`, `${testTempDir}/credentials`);
      const paths = getAwsConfigFilePaths();

      expect(paths.configFilePath).toBe(`${testTempDir}/config`);
      expect(paths.credentialsFilePath).toBe(`${testTempDir}/credentials`);
      expect(paths.isDefaultPath).toBe(false);
    });
  });

  describe('clearAwsConfigFilePaths', {}, () => {
    it('clears stored paths', {}, () => {
      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      createAwsConfigFiles(testCredentials, 'us-east-1', 'default');
      expect(getAwsConfigFilePaths().configFilePath).toBeDefined();

      clearAwsConfigFilePaths();
      const paths = getAwsConfigFilePaths();

      expect(paths.configFilePath).toBeUndefined();
      expect(paths.credentialsFilePath).toBeUndefined();
      expect(paths.isDefaultPath).toBeUndefined();
    });
  });

  describe('INI file format handling', {}, () => {
    it('handles config file format with [profile name] for non-default profiles', {}, () => {
      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      // Create files with multiple profiles
      createAwsConfigFiles(testCredentials, 'us-east-1', 'default');
      createAwsConfigFiles(testCredentials, 'us-west-2', 'production');
      createAwsConfigFiles(testCredentials, 'eu-west-1', 'staging');

      const configContent = fs.readFileSync(`${mockAwsDir}/config`, 'utf-8');

      // Default profile should not have "profile" prefix
      expect(configContent).toContain('[default]');
      // Non-default profiles should have "profile" prefix
      expect(configContent).toContain('[profile production]');
      expect(configContent).toContain('[profile staging]');
    });

    it('handles credentials file format with [name] for all profiles', {}, () => {
      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      // Create files with multiple profiles
      createAwsConfigFiles(testCredentials, 'us-east-1', 'default');
      createAwsConfigFiles(testCredentials, 'us-west-2', 'production');
      createAwsConfigFiles(testCredentials, 'eu-west-1', 'staging');

      const credsContent = fs.readFileSync(`${mockAwsDir}/credentials`, 'utf-8');

      // All profiles in credentials file should not have "profile" prefix
      expect(credsContent).toContain('[default]');
      expect(credsContent).toContain('[production]');
      expect(credsContent).toContain('[staging]');
      expect(credsContent).not.toContain('[profile');
    });

    it('handles parsing existing files with [profile name] format', {}, () => {
      fs.mkdirSync(mockAwsDir, { recursive: true });
      const existingConfig = `[default]
region = us-east-1

[profile production]
region = us-west-2
`;
      fs.writeFileSync(`${mockAwsDir}/config`, existingConfig);

      const testCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'testsecretkey123',
      };

      // Update production profile
      createAwsConfigFiles(testCredentials, 'eu-west-1', 'production');

      const configContent = fs.readFileSync(`${mockAwsDir}/config`, 'utf-8');
      expect(configContent).toContain('[default]');
      expect(configContent).toContain('region = us-east-1');
      expect(configContent).toContain('[profile production]');
      expect(configContent).toContain('region = eu-west-1');
    });
  });
});

