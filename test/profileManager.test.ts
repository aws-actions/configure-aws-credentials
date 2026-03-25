import * as core from '@actions/core';
import { fs, vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureAwsDirectoryExists,
  getProfileFilePaths,
  mergeProfileSection,
  parseIni,
  stringifyIni,
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

  describe('parseIni', {}, () => {
    it('parses a single section', {}, () => {
      const result = parseIni('[dev]\naws_access_key_id=AKIA\naws_secret_access_key=secret\n');
      expect(result.dev).toEqual({ aws_access_key_id: 'AKIA', aws_secret_access_key: 'secret' });
    });

    it('parses multiple sections', {}, () => {
      const result = parseIni('[dev]\nkey=dev_val\n\n[prod]\nkey=prod_val\n');
      expect(result.dev.key).toBe('dev_val');
      expect(result.prod.key).toBe('prod_val');
    });

    it('skips comments and empty lines', {}, () => {
      const result = parseIni('# comment\n; another comment\n\n[dev]\nkey=val\n');
      expect(result.dev).toEqual({ key: 'val' });
    });

    it('trims whitespace around keys and values', {}, () => {
      const result = parseIni('[dev]\n  key  =  val  \n');
      expect(result.dev.key).toBe('val');
    });

    it('preserves section names with spaces (e.g. profile prefix)', {}, () => {
      const result = parseIni('[profile dev]\nregion=us-east-1\n');
      expect(result['profile dev']).toEqual({ region: 'us-east-1' });
    });

    it('guards against __proto__ section pollution', {}, () => {
      const result = parseIni('[__proto__]\npolluted=true\n[safe]\nkey=val\n');
      expect(result.__proto__).not.toHaveProperty('polluted');
      expect(result.safe).toEqual({ key: 'val' });
    });

    it('guards against __proto__ key pollution', {}, () => {
      const result = parseIni('[dev]\n__proto__=evil\naws_access_key_id=AKIA\n');
      expect(result.dev).toEqual({ aws_access_key_id: 'AKIA' });
      expect(result.dev).not.toHaveProperty('__proto__', 'evil');
    });

    it('handles values containing equals signs', {}, () => {
      const result = parseIni('[dev]\naws_session_token=FwoGZXIvYXdzEBYa/base64==\n');
      expect(result.dev.aws_session_token).toBe('FwoGZXIvYXdzEBYa/base64==');
    });

    it('handles empty values', {}, () => {
      const result = parseIni('[dev]\ncli_pager=\n');
      expect(result.dev.cli_pager).toBe('');
    });

    it('returns empty object for empty input', {}, () => {
      expect(parseIni('')).toEqual({});
    });

    it('returns empty object for whitespace-only input', {}, () => {
      expect(parseIni('   \n\n  \n')).toEqual({});
    });

    it('handles Windows line endings (CRLF)', {}, () => {
      const result = parseIni('[dev]\r\naws_access_key_id=AKIA\r\naws_secret_access_key=secret\r\n');
      expect(result.dev).toEqual({ aws_access_key_id: 'AKIA', aws_secret_access_key: 'secret' });
    });
  });

  describe('stringifyIni', {}, () => {
    it('serializes a single section', {}, () => {
      const result = stringifyIni({ dev: { key: 'val' } });
      expect(result).toBe('[dev]\nkey = val\n');
    });

    it('serializes multiple sections with blank line separator', {}, () => {
      const result = stringifyIni({ dev: { a: '1' }, prod: { b: '2' } });
      expect(result).toBe('[dev]\na = 1\n\n[prod]\nb = 2\n');
    });

    it('round-trips through parseIni', {}, () => {
      const data = { dev: { aws_access_key_id: 'AKIA', aws_secret_access_key: 'secret' }, 'profile prod': { region: 'us-west-2' } };
      const roundTripped = parseIni(stringifyIni(data));
      expect(roundTripped).toEqual(data);
    });

    it('handles empty data object', {}, () => {
      const result = stringifyIni({});
      expect(result).toBe('\n');
      expect(parseIni(result)).toEqual({});
    });

    it('handles section with no keys', {}, () => {
      const result = stringifyIni({ dev: {} });
      expect(result).toBe('[dev]\n');
    });
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

      expect(paths.credentials).toMatch(/\.aws[/\\]credentials$/);
      expect(paths.config).toMatch(/\.aws[/\\]config$/);
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
      }, false);

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseIni(content);

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
      }, false);

      // Add second profile
      mergeProfileSection(filePath, 'prod', {
        aws_access_key_id: 'AKIAPRODEXAMPLE',
        aws_secret_access_key: 'prodSecretKey',
      }, false);

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseIni(content);

      expect(parsed.dev).toBeDefined();
      expect(parsed.dev.aws_access_key_id).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(parsed.prod).toBeDefined();
      expect(parsed.prod.aws_access_key_id).toBe('AKIAPRODEXAMPLE');
    });

    // it('overwrites existing profile with same name', {}, () => {
    //   const filePath = '/home/runner/.aws/credentials';
    //   fs.mkdirSync('/home/runner/.aws', { recursive: true });

    //   // Create initial profile
    //   mergeProfileSection(filePath, 'dev', {
    //     aws_access_key_id: 'OLD_KEY',
    //     aws_secret_access_key: 'oldSecretKey',
    //   });

    //   // Overwrite with new credentials
    //   mergeProfileSection(filePath, 'dev', {
    //     aws_access_key_id: 'NEW_KEY',
    //     aws_secret_access_key: 'newSecretKey',
    //     aws_session_token: 'sessionToken',
    //   });

    //   const content = fs.readFileSync(filePath, 'utf-8');
    //   const parsed = parseIni(content);

    //   expect(parsed.dev.aws_access_key_id).toBe('NEW_KEY');
    //   expect(parsed.dev.aws_secret_access_key).toBe('newSecretKey');
    //   expect(parsed.dev.aws_session_token).toBe('sessionToken');
    // });

    // it('overwriting a profile removes stale keys', {}, () => {
    //   const filePath = '/home/runner/.aws/credentials';
    //   fs.mkdirSync('/home/runner/.aws', { recursive: true });

    //   // Create profile with session token
    //   mergeProfileSection(filePath, 'dev', {
    //     aws_access_key_id: 'AKIA',
    //     aws_secret_access_key: 'secret',
    //     aws_session_token: 'old-token',
    //   });

    //   // Overwrite without session token
    //   mergeProfileSection(filePath, 'dev', {
    //     aws_access_key_id: 'AKIA2',
    //     aws_secret_access_key: 'secret2',
    //   });

    //   const content = fs.readFileSync(filePath, 'utf-8');
    //   const parsed = parseIni(content);

    //   expect(parsed.dev.aws_access_key_id).toBe('AKIA2');
    //   expect(parsed.dev.aws_secret_access_key).toBe('secret2');
    //   expect(parsed.dev.aws_session_token).toBeUndefined();
    // });

    // it('handles empty existing file', {}, () => {
    //   const filePath = '/home/runner/.aws/credentials';
    //   fs.mkdirSync('/home/runner/.aws', { recursive: true });
    //   fs.writeFileSync(filePath, '', { mode: 0o600 });

    //   mergeProfileSection(filePath, 'dev', {
    //     aws_access_key_id: 'AKIA',
    //     aws_secret_access_key: 'secret',
    //   });

    //   const content = fs.readFileSync(filePath, 'utf-8');
    //   const parsed = parseIni(content);

    //   expect(parsed.dev.aws_access_key_id).toBe('AKIA');
    //   expect(parsed.dev.aws_secret_access_key).toBe('secret');
    // });
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
        false,
      );

      // Check credentials file
      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');
      const credParsed = parseIni(credContent);

      expect(credParsed.dev).toBeDefined();
      expect(credParsed.dev.aws_access_key_id).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(credParsed.dev.aws_secret_access_key).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
      expect(credParsed.dev.aws_session_token).toBe('FwoGZXIvYXdzEBYaDEXAMPLE');

      // Check config file
      const configPath = getProfileFilePaths().config;
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const configParsed = parseIni(configContent);

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
        false,
      );

      // Check credentials file uses [default]
      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');
      const credParsed = parseIni(credContent);

      expect(credParsed.default).toBeDefined();
      expect(credParsed['profile default']).toBeUndefined();

      // Check config file uses [default] (not [profile default])
      const configPath = getProfileFilePaths().config;
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const configParsed = parseIni(configContent);

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
        false,
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
        false,
      );

      // Verify both profiles exist
      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');
      const credParsed = parseIni(credContent);

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
        false,
      );

      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');
      const credParsed = parseIni(credContent);

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
          false,
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
          false
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
        false
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
        false
      );

      expect(core.info).toHaveBeenCalledWith('Writing credentials to profile: dev');
      expect(core.info).toHaveBeenCalledWith('Writing config to profile: dev');
      expect(core.info).toHaveBeenCalledWith('✓ Successfully configured AWS profile: dev');
    });

    it('preserves pre-existing unrelated profiles in credentials file', {}, () => {
      const credsPath = getProfileFilePaths().credentials;
      fs.mkdirSync(require('node:path').dirname(credsPath), { recursive: true });
      fs.writeFileSync(
        credsPath,
        '[personal]\naws_access_key_id=AKIAPERSONAL\naws_secret_access_key=personalSecret\naws_session_token=personalToken\n',
      );

      writeProfileFiles(
        'dev',
        { AccessKeyId: 'AKIADEV', SecretAccessKey: 'devSecret' },
        'us-east-1',
        false,
      );

      const content = fs.readFileSync(credsPath, 'utf-8');
      const parsed = parseIni(content);

      // Pre-existing profile must be fully intact
      expect(parsed.personal).toEqual({
        aws_access_key_id: 'AKIAPERSONAL',
        aws_secret_access_key: 'personalSecret',
        aws_session_token: 'personalToken',
      });
      // New profile also present
      expect(parsed.dev.aws_access_key_id).toBe('AKIADEV');
    });

    it('preserves pre-existing config with extra keys', {}, () => {
      const configPath = getProfileFilePaths().config;
      fs.mkdirSync(require('node:path').dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[profile personal]\nregion=eu-west-1\noutput=json\ncli_pager=\n',
      );

      writeProfileFiles(
        'dev',
        { AccessKeyId: 'AKIA', SecretAccessKey: 'secret' },
        'us-east-1',
        false
      );

      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = parseIni(content);

      expect(parsed['profile personal']).toEqual({
        region: 'eu-west-1',
        output: 'json',
        cli_pager: '',
      });
      expect(parsed['profile dev'].region).toBe('us-east-1');
    });

    it('preserves pre-existing default profile when writing a named profile', {}, () => {
      const credsPath = getProfileFilePaths().credentials;
      fs.mkdirSync(require('node:path').dirname(credsPath), { recursive: true });
      fs.writeFileSync(
        credsPath,
        '[default]\naws_access_key_id=AKIADEFAULT\naws_secret_access_key=defaultSecret\n',
      );

      writeProfileFiles(
        'dev',
        { AccessKeyId: 'AKIADEV', SecretAccessKey: 'devSecret' },
        'us-west-2',
        false
      );

      const content = fs.readFileSync(credsPath, 'utf-8');
      const parsed = parseIni(content);

      expect(parsed.default).toEqual({
        aws_access_key_id: 'AKIADEFAULT',
        aws_secret_access_key: 'defaultSecret',
      });
      expect(parsed.dev.aws_access_key_id).toBe('AKIADEV');
    });

    it('comments in pre-existing files are stripped on round-trip', {}, () => {
      const credsPath = getProfileFilePaths().credentials;
      fs.mkdirSync(require('node:path').dirname(credsPath), { recursive: true });
      fs.writeFileSync(
        credsPath,
        '# My important comment\n[personal]\naws_access_key_id=AKIA\naws_secret_access_key=secret\n',
      );

      writeProfileFiles(
        'dev',
        { AccessKeyId: 'AKIADEV', SecretAccessKey: 'devSecret' },
        'us-east-1',
        false
      );

      const content = fs.readFileSync(credsPath, 'utf-8') as string;

      // Comment is lost (known trade-off), but profile data is preserved
      expect(content).not.toContain('# My important comment');
      const parsed = parseIni(content);
      expect(parsed.personal.aws_access_key_id).toBe('AKIA');
      expect(parsed.dev.aws_access_key_id).toBe('AKIADEV');
    });

    it('writes empty section when credentials object has no keys', {}, () => {
      writeProfileFiles('dev', {}, 'us-east-1', false);

      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');
      const credParsed = parseIni(credContent);

      // Section exists but has no credential keys
      expect(credParsed.dev).toEqual({});

      // Config still gets region
      const configPath = getProfileFilePaths().config;
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const configParsed = parseIni(configContent);
      expect(configParsed['profile dev'].region).toBe('us-east-1');
    });

    it('resolves credentials and config paths independently from env vars', {}, () => {
      process.env.AWS_SHARED_CREDENTIALS_FILE = '/custom-creds/credentials';
      // AWS_CONFIG_FILE is NOT set — should use default path

      fs.mkdirSync('/custom-creds', { recursive: true });

      writeProfileFiles(
        'dev',
        { AccessKeyId: 'AKIA', SecretAccessKey: 'secret' },
        'us-east-1',
        false
      );

      expect(fs.existsSync('/custom-creds/credentials')).toBe(true);
      // Config file should be at the default path (under homedir)
      const defaultConfigPath = require('node:path').join(require('node:os').homedir(), '.aws', 'config');
      expect(fs.existsSync(defaultConfigPath)).toBe(true);
    });

    it('produces AWS CLI-compatible INI output (golden file)', {}, () => {
      writeProfileFiles(
        'dev',
        {
          AccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          SessionToken: 'FwoGZXIvYXdzEBYaDEXAMPLE',
        },
        'us-east-1',
        false
      );

      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');

      const configPath = getProfileFilePaths().config;
      const configContent = fs.readFileSync(configPath, 'utf-8');

      // Verify exact byte-for-byte format matching AWS CLI style:
      // - [section] header on its own line
      // - key = value with spaces around =
      // - LF line endings, trailing newline
      expect(credContent).toBe(
        '[dev]\n' +
        'aws_access_key_id = AKIAIOSFODNN7EXAMPLE\n' +
        'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n' +
        'aws_session_token = FwoGZXIvYXdzEBYaDEXAMPLE\n',
      );
      expect(configContent).toBe(
        '[profile dev]\n' +
        'region = us-east-1\n',
      );
    });

    it('golden file for multi-profile output', {}, () => {
      writeProfileFiles(
        'dev',
        { AccessKeyId: 'AKIADEV', SecretAccessKey: 'devSecret' },
        'us-east-1',
        false
      );
      writeProfileFiles(
        'prod',
        { AccessKeyId: 'AKIAPROD', SecretAccessKey: 'prodSecret', SessionToken: 'prodToken' },
        'us-west-2',
        false
      );

      const credsPath = getProfileFilePaths().credentials;
      const credContent = fs.readFileSync(credsPath, 'utf-8');

      const configPath = getProfileFilePaths().config;
      const configContent = fs.readFileSync(configPath, 'utf-8');

      expect(credContent).toBe(
        '[dev]\n' +
        'aws_access_key_id = AKIADEV\n' +
        'aws_secret_access_key = devSecret\n' +
        '\n' +
        '[prod]\n' +
        'aws_access_key_id = AKIAPROD\n' +
        'aws_secret_access_key = prodSecret\n' +
        'aws_session_token = prodToken\n',
      );
      expect(configContent).toBe(
        '[profile dev]\n' +
        'region = us-east-1\n' +
        '\n' +
        '[profile prod]\n' +
        'region = us-west-2\n',
      );
    });
  });
});
