import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as core from '@actions/core';
import type { Credentials } from '@aws-sdk/client-sts';

/**
 * Parse an INI-format string into a nested object.
 * Preserves literal section names (e.g. "profile dev" stays as-is).
 */
export function parseIni(iniData: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let currentSection: string | undefined;

  for (const line of iniData.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\[([^\]]*)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1] as string;
      if (currentSection === '__proto__') {
        currentSection = undefined;
        continue;
      }
      result[currentSection] = result[currentSection] || {};
      continue;
    }

    if (currentSection) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        if (key !== '__proto__') {
          const section = result[currentSection];
          if (section) {
            section[key] = value;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Serialize a nested object into INI-format string.
 */
export function stringifyIni(data: Record<string, Record<string, string>>): string {
  const sections: string[] = [];
  for (const [sectionName, sectionData] of Object.entries(data)) {
    const lines: string[] = [`[${sectionName}]`];
    for (const [key, value] of Object.entries(sectionData)) {
      lines.push(`${key} = ${value}`);
    }
    sections.push(lines.join('\n'));
  }
  return `${sections.join('\n\n')}\n`;
}

interface ProfileFilePaths {
  credentials: string;
  config: string;
}

/**
 * Get the file paths for AWS credentials and config files
 * Respects AWS_SHARED_CREDENTIALS_FILE and AWS_CONFIG_FILE environment variables
 */
export function getProfileFilePaths(): ProfileFilePaths {
  const credentialsPath = process.env.AWS_SHARED_CREDENTIALS_FILE || path.join(os.homedir(), '.aws', 'credentials');
  const configPath = process.env.AWS_CONFIG_FILE || path.join(os.homedir(), '.aws', 'config');

  return {
    credentials: credentialsPath,
    config: configPath,
  };
}

/**
 * Ensure the AWS directory exists with secure permissions
 * Creates the directory with 700 permissions (rwx for owner only)
 */
export function ensureAwsDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    core.debug(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Validate profile name format
 * Profile names must be non-empty, contain no whitespace, brackets, or path separators
 */
export function validateProfileName(profileName: string): void {
  if (!profileName || profileName.trim() === '') {
    throw new Error('aws-profile must not be empty');
  }

  if (/\s/.test(profileName)) {
    throw new Error('aws-profile must not contain whitespace');
  }

  // INI section names can't contain brackets
  if (/[[\]]/.test(profileName)) {
    throw new Error('aws-profile must not contain brackets');
  }

  // Prevent path traversal
  if (profileName.includes('/') || profileName.includes('\\')) {
    throw new Error('aws-profile must not contain path separators');
  }
}

/**
 * Merge a profile section into an INI file
 * Reads existing file, updates the specified section, and writes back
 */
export function mergeProfileSection(filePath: string, sectionName: string, data: Record<string, string>): void {
  let existingContent: Record<string, Record<string, string>> = {};

  // Read existing file if it exists
  if (fs.existsSync(filePath)) {
    core.debug(`Reading existing file: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    existingContent = parseIni(fileContent);
  }

  if (existingContent[sectionName]) {
    throw new Error(`Profile with name "${sectionName}" already exists.`);
  }
  // Merge: update existing profile or add new one
  existingContent[sectionName] = data;

  const content = stringifyIni(existingContent);

  core.debug(`Writing profile to ${filePath}`);
  fs.writeFileSync(filePath, content, { mode: 0o600 });
}

/**
 * Write AWS profile files with credentials and configuration
 * This is the main entry point for profile file operations
 *
 * @param profileName - Name of the AWS profile to configure
 * @param credentials - AWS credentials (access key, secret key, session token)
 * @param region - AWS region
 */
export function writeProfileFiles(profileName: string, credentials: Partial<Credentials>, region: string): void {
  try {
    // Validate profile name
    validateProfileName(profileName);

    const paths = getProfileFilePaths();

    // Ensure .aws directory exists
    ensureAwsDirectoryExists(paths.credentials);
    ensureAwsDirectoryExists(paths.config);

    // Prepare credentials data
    const credentialsData: Record<string, string> = {};
    if (credentials.AccessKeyId) {
      credentialsData.aws_access_key_id = credentials.AccessKeyId;
    }
    if (credentials.SecretAccessKey) {
      credentialsData.aws_secret_access_key = credentials.SecretAccessKey;
    }
    if (credentials.SessionToken) {
      credentialsData.aws_session_token = credentials.SessionToken;
    }

    // Credentials file uses [profileName] syntax
    const credsSectionName = profileName;

    // Config file uses [profile profileName] syntax, except for 'default'
    const configSectionName = profileName === 'default' ? 'default' : `profile ${profileName}`;

    // Prepare config data
    const configData: Record<string, string> = {
      region: region,
    };

    // Write to credentials file
    core.info(`Writing credentials to profile: ${profileName}`);
    mergeProfileSection(paths.credentials, credsSectionName, credentialsData);

    // Write to config file
    core.info(`Writing config to profile: ${profileName}`);
    mergeProfileSection(paths.config, configSectionName, configData);

    core.info(`✓ Successfully configured AWS profile: ${profileName}`);
  } catch (error) {
    throw new Error(
      `Failed to write AWS profile '${profileName}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
