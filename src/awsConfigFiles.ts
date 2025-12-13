import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as core from '@actions/core';
import type { Credentials } from '@aws-sdk/client-sts';

// Store paths to created config files for cleanup
let awsConfigFilePath: string | undefined;
let awsSharedCredentialsFilePath: string | undefined;
let awsConfigFilesIsDefaultPath: boolean | undefined;

// Expand ~ in file paths to home directory
export function expandPath(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return filePath.replace('~', os.homedir());
  }
  return filePath;
}

// Parse INI file content into sections
export interface IniSection {
  [key: string]: string;
}

export interface IniFile {
  [profile: string]: IniSection;
}

// Parse INI file content
function parseIniFile(content: string): IniFile {
  const result: IniFile = {};
  let currentProfile = '';
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    // Check for profile section [profile-name] or [profile profile-name]
    const profileMatch = trimmed.match(/^\[(?:profile\s+)?(.+)\]$/);
    if (profileMatch?.[1]) {
      currentProfile = profileMatch[1];
      if (!result[currentProfile]) {
        result[currentProfile] = {};
      }
      continue;
    }

    // Parse key = value
    const keyValueMatch = trimmed.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (keyValueMatch && currentProfile) {
      const key = keyValueMatch[1]?.trim() ?? '';
      const value = keyValueMatch[2]?.trim() ?? '';
      if (key && currentProfile) {
        if (!result[currentProfile]) {
          result[currentProfile] = {};
        }
        const profile = result[currentProfile];
        if (profile) {
          profile[key] = value;
        }
      }
    }
  }

  return result;
}

// Serialize INI file from sections
// isConfigFile: true for config file (uses [profile name]), false for credentials (uses [name])
function serializeIniFile(sections: IniFile, isConfigFile: boolean): string {
  const lines: string[] = [];
  const profiles = Object.keys(sections).sort();

  for (const profile of profiles) {
    // Config files use [profile name] for non-default, credentials use [name]
    if (profile === 'default') {
      lines.push(`[${profile}]`);
    } else if (isConfigFile) {
      lines.push(`[profile ${profile}]`);
    } else {
      lines.push(`[${profile}]`);
    }

    const section = sections[profile];
    if (section) {
      const keys = Object.keys(section).sort();
      for (const key of keys) {
        const value = section[key];
        if (value !== undefined) {
          lines.push(`${key} = ${value}`);
        }
      }
    }
    lines.push(''); // Empty line between sections
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

// Update or add a profile in INI file content
function updateIniProfile(content: string, profileName: string, updates: IniSection, isConfigFile: boolean): string {
  const sections = parseIniFile(content);
  const existingProfile = sections[profileName];
  sections[profileName] = { ...existingProfile, ...updates };
  return serializeIniFile(sections, isConfigFile);
}

// Create or update AWS config files with credentials
export function createAwsConfigFiles(
  creds: Partial<Credentials>,
  region: string,
  profileName: string,
  configFilePath?: string,
  credentialsFilePath?: string,
  debugLogging?: boolean,
): { configFile: string; credentialsFile: string; isDefaultPath: boolean } {
  const log = debugLogging === true ? core.info.bind(core) : core.debug.bind(core);
  const homeDir = os.homedir();
  const defaultAwsDir = path.join(homeDir, '.aws');

  log(`Creating AWS config files for profile: ${profileName}`);

  // Expand ~ in custom paths if provided
  const expandedConfigPath = configFilePath ? expandPath(configFilePath) : undefined;
  const expandedCredentialsPath = credentialsFilePath ? expandPath(credentialsFilePath) : undefined;

  if (configFilePath) {
    log(`Using explicit config file path: ${configFilePath} (expanded: ${expandedConfigPath})`);
  } else if (process.env.AWS_CONFIG_FILE) {
    log(
      `Using AWS_CONFIG_FILE environment variable: ${process.env.AWS_CONFIG_FILE} (expanded: ${expandPath(process.env.AWS_CONFIG_FILE)})`,
    );
  } else {
    log(`Using default config file path: ${path.join(defaultAwsDir, 'config')}`);
  }

  if (credentialsFilePath) {
    log(`Using explicit credentials file path: ${credentialsFilePath} (expanded: ${expandedCredentialsPath})`);
  } else if (process.env.AWS_SHARED_CREDENTIALS_FILE) {
    log(
      `Using AWS_SHARED_CREDENTIALS_FILE environment variable: ${process.env.AWS_SHARED_CREDENTIALS_FILE} (expanded: ${expandPath(process.env.AWS_SHARED_CREDENTIALS_FILE)})`,
    );
  } else {
    log(`Using default credentials file path: ${path.join(defaultAwsDir, 'credentials')}`);
  }

  // Determine config file path:
  // 1. Use explicit input path if provided
  // 2. Otherwise, use AWS_CONFIG_FILE environment variable if set
  // 3. Otherwise, use default ~/.aws/config
  const configFile =
    expandedConfigPath ??
    (process.env.AWS_CONFIG_FILE ? expandPath(process.env.AWS_CONFIG_FILE) : path.join(defaultAwsDir, 'config'));

  // Determine credentials file path:
  // 1. Use explicit input path if provided
  // 2. Otherwise, use AWS_SHARED_CREDENTIALS_FILE environment variable if set
  // 3. Otherwise, use default ~/.aws/credentials
  const credentialsFile =
    expandedCredentialsPath ??
    (process.env.AWS_SHARED_CREDENTIALS_FILE
      ? expandPath(process.env.AWS_SHARED_CREDENTIALS_FILE)
      : path.join(defaultAwsDir, 'credentials'));

  // Consider it a default path only if using the standard default locations (~/.aws/config and ~/.aws/credentials)
  // This affects cleanup behavior - default paths persist, custom paths (including env var paths) are cleaned up
  const defaultConfigFile = path.join(defaultAwsDir, 'config');
  const defaultCredentialsFile = path.join(defaultAwsDir, 'credentials');
  const isDefaultPath =
    !configFilePath &&
    !credentialsFilePath &&
    configFile === defaultConfigFile &&
    credentialsFile === defaultCredentialsFile;

  log(`Resolved config file path: ${configFile}`);
  log(`Resolved credentials file path: ${credentialsFile}`);
  log(`Is default path: ${isDefaultPath}`);

  // Ensure the .aws directory exists if we're using default paths
  // This handles both explicit default paths and env vars pointing to ~/.aws/*
  if (configFile.startsWith(defaultAwsDir) || credentialsFile.startsWith(defaultAwsDir)) {
    if (!fs.existsSync(defaultAwsDir)) {
      log(`Creating .aws directory: ${defaultAwsDir}`);
      fs.mkdirSync(defaultAwsDir, { mode: 0o700, recursive: true });
    }
  }

  // Ensure parent directories exist for all file paths
  const configDir = path.dirname(configFile);
  const credsDir = path.dirname(credentialsFile);
  
  if (!fs.existsSync(configDir)) {
    log(`Creating parent directory for config file: ${configDir}`);
    fs.mkdirSync(configDir, { mode: 0o700, recursive: true });
  }
  if (!fs.existsSync(credsDir) && configDir !== credsDir) {
    log(`Creating parent directory for credentials file: ${credsDir}`);
    fs.mkdirSync(credsDir, { mode: 0o700, recursive: true });
  }

  // Handle config file - update existing or create new
  let configContent = '';
  const configFileExists = fs.existsSync(configFile);
  if (configFileExists) {
    log(`Config file exists, updating profile '${profileName}' in existing file`);
    // File exists, read and update it
    const existingContent = fs.readFileSync(configFile, 'utf-8');
    configContent = updateIniProfile(existingContent, profileName, { region }, true);
  } else {
    log(`Config file does not exist, creating new file with profile '${profileName}'`);
    // File doesn't exist, create new with profile
    const sections: IniFile = {};
    sections[profileName] = { region };
    configContent = serializeIniFile(sections, true);
  }
  fs.writeFileSync(configFile, configContent, { mode: 0o600 });
  log(`Wrote config file to ${configFile} with mode 0o600`);

  // Handle credentials file - update existing or create new
  const credentialsUpdates: IniSection = {
    aws_access_key_id: creds.AccessKeyId ?? '',
    aws_secret_access_key: creds.SecretAccessKey ?? '',
  };
  if (creds.SessionToken) {
    credentialsUpdates.aws_session_token = creds.SessionToken;
  }

  let credentialsContent = '';
  const credentialsFileExists = fs.existsSync(credentialsFile);
  if (credentialsFileExists) {
    log(`Credentials file exists, updating profile '${profileName}' in existing file`);
    // File exists, read and update it
    const existingContent = fs.readFileSync(credentialsFile, 'utf-8');
    credentialsContent = updateIniProfile(existingContent, profileName, credentialsUpdates, false);
  } else {
    log(`Credentials file does not exist, creating new file with profile '${profileName}'`);
    // File doesn't exist, create new with profile
    const sections: IniFile = {};
    sections[profileName] = credentialsUpdates;
    credentialsContent = serializeIniFile(sections, false);
  }
  fs.writeFileSync(credentialsFile, credentialsContent, { mode: 0o600 });
  log(`Wrote credentials file to ${credentialsFile} with mode 0o600`);

  // Store paths for cleanup
  awsConfigFilePath = configFile;
  awsSharedCredentialsFilePath = credentialsFile;
  awsConfigFilesIsDefaultPath = isDefaultPath;

  return { configFile, credentialsFile, isDefaultPath };
}

// Get stored config file paths for cleanup
export function getAwsConfigFilePaths(): {
  configFilePath: string | undefined;
  credentialsFilePath: string | undefined;
  isDefaultPath: boolean | undefined;
} {
  return {
    configFilePath: awsConfigFilePath,
    credentialsFilePath: awsSharedCredentialsFilePath,
    isDefaultPath: awsConfigFilesIsDefaultPath,
  };
}

// Clear stored config file paths
export function clearAwsConfigFilePaths(): void {
  awsConfigFilePath = undefined;
  awsSharedCredentialsFilePath = undefined;
  awsConfigFilesIsDefaultPath = undefined;
}
