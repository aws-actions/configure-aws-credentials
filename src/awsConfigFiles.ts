import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
): { configFile: string; credentialsFile: string; isDefaultPath: boolean } {
  const homeDir = os.homedir();
  const defaultAwsDir = path.join(homeDir, '.aws');

  // Expand ~ in custom paths if provided
  const expandedConfigPath = configFilePath ? expandPath(configFilePath) : undefined;
  const expandedCredentialsPath = credentialsFilePath ? expandPath(credentialsFilePath) : undefined;

  // Use custom paths if provided, otherwise use defaults
  const configFile = expandedConfigPath ?? path.join(defaultAwsDir, 'config');
  const credentialsFile = expandedCredentialsPath ?? path.join(defaultAwsDir, 'credentials');
  const isDefaultPath = !configFilePath && !credentialsFilePath;

  // Only create files if they don't exist and option is selected
  // Create .aws directory if using default paths and it doesn't exist
  if (isDefaultPath && !fs.existsSync(defaultAwsDir)) {
    fs.mkdirSync(defaultAwsDir, { mode: 0o700, recursive: true });
  } else if (!isDefaultPath) {
    // Ensure parent directory exists for custom paths
    const configDir = path.dirname(configFile);
    const credsDir = path.dirname(credentialsFile);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { mode: 0o700, recursive: true });
    }
    if (!fs.existsSync(credsDir) && configDir !== credsDir) {
      fs.mkdirSync(credsDir, { mode: 0o700, recursive: true });
    }
  }

  // Handle config file - update existing or create new
  let configContent = '';
  if (fs.existsSync(configFile)) {
    // File exists, read and update it
    const existingContent = fs.readFileSync(configFile, 'utf-8');
    configContent = updateIniProfile(existingContent, profileName, { region }, true);
  } else {
    // File doesn't exist, create new with profile
    const sections: IniFile = {};
    sections[profileName] = { region };
    configContent = serializeIniFile(sections, true);
  }
  fs.writeFileSync(configFile, configContent, { mode: 0o600 });

  // Handle credentials file - update existing or create new
  const credentialsUpdates: IniSection = {
    aws_access_key_id: creds.AccessKeyId ?? '',
    aws_secret_access_key: creds.SecretAccessKey ?? '',
  };
  if (creds.SessionToken) {
    credentialsUpdates.aws_session_token = creds.SessionToken;
  }

  let credentialsContent = '';
  if (fs.existsSync(credentialsFile)) {
    // File exists, read and update it
    const existingContent = fs.readFileSync(credentialsFile, 'utf-8');
    credentialsContent = updateIniProfile(existingContent, profileName, credentialsUpdates, false);
  } else {
    // File doesn't exist, create new with profile
    const sections: IniFile = {};
    sections[profileName] = credentialsUpdates;
    credentialsContent = serializeIniFile(sections, false);
  }
  fs.writeFileSync(credentialsFile, credentialsContent, { mode: 0o600 });

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
