import * as core from '@actions/core';
import { fs, vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ini from 'ini';
import {
  ensureAwsDirectoryExists,
  getProfileFilePaths,
  mergeProfileSection,
  validateProfileName,
  writeProfileFiles,
} from '../src/profileManager';

describe('Profile Manager', {}, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mock('node:fs');
    vol.reset();
    vi.spyOn(core, 'debug').mockImplementation(() => {});
    vi.spyOn(core, 'info').mockImplementation(() => {});
  });

  describe('validateProfileName', {}, () => {
    it('accepts valid profile names', {}, () => {
      expect(() => validateProfileName('dev')).not.toThrow();
      expect(() => validateProfileName('production')).not.toThrow();
      expect(() => validateProfileName('my-profile-123')).not.toThrow();
      expect(() => validateProfileName('default')).not.toThrow();
    });

    it('rejects empty profile names', {}, () => {
      expect(() => validateProfileName('')).toThrow('aws-profile must not be empty');
      expect(() => validateProfileName('   ')).toThrow('aws-profile must not be empty');
    });

    it('rejects profile names with whitespace', {}, () => {
      expect(() => validateProfileName('my profile')).toThrow('aws-profile must not contain whitespace');
      expect(() => validateProfileName('dev\ntest')).toThrow('aws-profile must not contain whitespace');
      expect(() => validateProfileName('prod\tenv')).toThrow('aws-profile must not contain whitespace');
    });

    it('rejects profile names with brackets', {}, () => {
      expect(() => validateProfileName('dev[test]')).toThrow('aws-profile must not contain brackets');
      expect(() => validateProfileName('[profile]')).toThrow('aws-profile must not contain brackets');
    });

    it('rejects profile names with path separators', {}, () => {
      expect(() => validateProfileName('dev/test')).toThrow('aws-profile must not contain path separators');
      expect(() => validateProfileName('dev\\test')).toThrow('aws-profile must not contain path separators');
      expect(() => validateProfileName('../etc/passwd')).toThrow('aws-profile must not contain path separators');
    });
  });

  describe('getProfileFilePaths', {}, () => {
    it('returns default paths when env vars not set', {}, () => {
      delete process.env.AWS_SHARED_CREDENTIALS_FILE;
      delete process.env.AWS_CONFIG_FILE;

      const paths = getProfileFilePaths();

      expect(paths.credentials).toMatch(/\.aws\/credentials$/);
      expect(paths.config).toMatch(/\.aws\/config$/);
    });

    it('respects AWS_SHARED_CREDENTIALS_FILE env var', {}, () => {
      process.env.AWS_SHARED_CREDENTIALS_FILE = '/custom/path/credentials';
      process.env.AWS_CONFIG_FILE = '/custom/path/config';

      const paths = getProfileFilePaths();

      expect(paths.credentials).toBe('/custom/path/credentials');
      expect(paths.config).toBe('/custom/path/config');
    });
  });

  describe('ensureAwsDirectoryExists', {}, () => {
    it('creates directory if it does not exist', {}, () => {
      const filePath = '/home/runner/.aws/credentials';

      ensureAwsDirectoryExists(filePath);

      expect(fs.existsSync('/home/runner/.aws')).toBe(true);
    });

    it('does not error if directory already exists', {}, () => {
      const filePath = '/home/runner/.aws/credentials';

      fs.mkdirSync('/home/runner/.aws', { recursive: true });

      expect(() => ensureAwsDirectoryExists(filePath)).not.toThrow();
    });

    it('creates nested directories', {}, () => {
      const filePath = '/home/runner/custom/path/.aws/credentials';

      ensureAwsDirectoryExists(filePath);

      expect(fs.existsSync('/home/runner/custom/path/.aws')).toBe(true);
    });
  });

  describe('mergeProfileSection', {}, () => {
    it('creates new file with profile section', {}, () => {
      const filePath = '/home/runner/.aws/credentials';
      fs.mkdirSync('/home/runner/.aws', { recursive: true });

      mergeProfileSection(filePath, 'dev', {
        aws_access_key_id: 'AKIAIOSFODNN7EXAMPLE',
        aws_secret_access_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = ini.parse(content);

      expect(parsed.dev).toBeDefined();
      expect(parsed.dev.aws_access_key_id).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(parsed.dev.aws_secret_access_key).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    });

    it('merges with existing profiles', {}, () => {
      const filePath = '/home/runner/.aws/credentials';
      fs.mkdirSync('/home/runner/.aws', { recursive: true });

      // Create initial profile
      mergeProfileSection(filePath, 'dev', {
        aws_access_key_id: 'AKIAIOSFODNN7EXAMPLE',
        aws_secret_access_key: 'devSecretKey',
      });

      // Add second profile
      mergeProfileSection(filePath, 'prod', {
        aws_access_key_id: 'AKIAPRODEXAMPLE',
        aws_secret_access_key: 'prodSecretKey',
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = ini.parse(content);

      expect(parsed.dev).toBeDefined();
      expect(parsed.dev.aws_access_key_id).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(parsed.prod).toBeDefined();
      expect(parsed.prod.aws_access_key_id).toBe('AKIAPRODEXAMPLE');
    });

    it('overwrites existing profile with same name', {}, () => {
      const filePath = '/home/runner/.aws/credentials';
      fs.mkdirSync('/home/runner/.aws', { recursive: true });

      // Create initial profile
      mergeProfileSection(filePath, 'dev', {
        aws_access_key_id: 'OLD_KEY',
        aws_secret_access_key: 'oldSecretKey',
      });

      // Overwrite with new credentials
      mergeProfileSection(filePath, 'dev', {
        aws_access_key_id: 'NEW_KEY',
        aws_secret_access_key: 'newSecretKey',
        aws_session_token: 'sessionToken',
      });

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = ini.parse(content);

      expect(parsed.dev.aws_access_key_id).toBe('NEW_KEY');
      expect(parsed.dev.aws_secret_access_key).toBe('newSecretKey');
      expect(parsed.dev.aws_session_token).toBe('sessionToken');
    });
  });

  describe('writeProfileFiles', {}, () => {
    beforeEach(() => {
      delete process.env.AWS_SHARED_CREDENTIALS_FILE;
      delete process.env.AWS_CONFIG_FILE;
    });

    it('writes credentials and config for new profile', {}, () => {
      writeProfileFiles(
        'dev',
        {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          SessionToken: 'FwoGZXIvYXdzEBYaDEXAMPLE',
        },
        'us-east-1',
      );

      // Check credentials file
      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');
      const credParsed = ini.parse(credContent);

      expect(credParsed.dev).toBeDefined();
      expect(credParsed.dev.aws_access_key_id).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(credParsed.dev.aws_secret_access_key).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(credParsed.dev.aws_session_token).toBe('FwoGZXIvYXdzEBYaDEXAMPLE');

      // Check config file
      const configPath = getProfileFilePaths().config;
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const configParsed = ini.parse(configContent);

      expect(configParsed['profile dev']).toBeDefined();
      expect(configParsed['profile dev'].region).toBe('us-east-1');
    });

    it('uses correct section naming for default profile', {}, () => {
      writeProfileFiles(
        'default',
        {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        },
        'us-west-2',
      );

      // Check credentials file uses [default]
      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');
      const credParsed = ini.parse(credContent);

      expect(credParsed.default).toBeDefined();
      expect(credParsed['profile default']).toBeUndefined();

      // Check config file uses [default] (not [profile default])
      const configPath = getProfileFilePaths().config;
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const configParsed = ini.parse(configContent);

      expect(configParsed.default).toBeDefined();
      expect(configParsed['profile default']).toBeUndefined();
    });

    it('supports multiple profiles', {}, () => {
      // Write first profile
      writeProfileFiles(
        'dev',
        {
          AccessKeyId: 'AKIADEV',
          SecretAccessKey: 'devSecret',
        },
        'us-east-1',
      );

      // Write second profile
      writeProfileFiles(
        'prod',
        {
          AccessKeyId: 'AKIAPROD',
          SecretAccessKey: 'prodSecret',
          SessionToken: 'prodToken',
        },
        'us-west-2',
      );

      // Verify both profiles exist
      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');
      const credParsed = ini.parse(credContent);

      expect(credParsed.dev).toBeDefined();
      expect(credParsed.prod).toBeDefined();
      expect(credParsed.dev.aws_access_key_id).toBe('AKIADEV');
      expect(credParsed.prod.aws_access_key_id).toBe('AKIAPROD');
    });

    it('handles credentials without session token', {}, () => {
      writeProfileFiles(
        'dev',
        {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        },
        'us-east-1',
      );

      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');
      const credParsed = ini.parse(credContent);

      expect(credParsed.dev.aws_access_key_id).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(credParsed.dev.aws_secret_access_key).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(credParsed.dev.aws_session_token).toBeUndefined();
    });

    it('throws error for invalid profile name', {}, () => {
      expect(() =>
        writeProfileFiles(
          'invalid profile',
          {
            AccessKeyId: 'AKIA',
            SecretAccessKey: 'secret',
          },
          'us-east-1',
        ),
      ).toThrow('Failed to write AWS profile');
      expect(() =>
        writeProfileFiles(
          'invalid profile',
          {
            AccessKeyId: 'AKIA',
            SecretAccessKey: 'secret',
          },
          'us-east-1',
        ),
      ).toThrow('whitespace');
    });

    it('respects custom file paths from env vars', {}, () => {
      process.env.AWS_SHARED_CREDENTIALS_FILE = '/custom/credentials';
      process.env.AWS_CONFIG_FILE = '/custom/config';

      fs.mkdirSync('/custom', { recursive: true });

      writeProfileFiles(
        'dev',
        {
          AccessKeyId: 'AKIA',
          SecretAccessKey: 'secret',
        },
        'us-east-1',
      );

      expect(fs.existsSync('/custom/credentials')).toBe(true);
      expect(fs.existsSync('/custom/config')).toBe(true);
    });

    it('logs info messages', {}, () => {
      writeProfileFiles(
        'dev',
        {
          AccessKeyId: 'AKIA',
          SecretAccessKey: 'secret',
        },
        'us-east-1',
      );

      expect(core.info).toHaveBeenCalledWith('Writing credentials to profile: dev');
      expect(core.info).toHaveBeenCalledWith('Writing config to profile: dev');
      expect(core.info).toHaveBeenCalledWith('✓ Successfully configured AWS profile: dev');
    });
  });
});
