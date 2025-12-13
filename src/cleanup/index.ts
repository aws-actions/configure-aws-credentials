import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@actions/core';
import { expandPath } from '../awsConfigFiles';
import { errorMessage, getBooleanInput } from '../helpers';

/**
 * When the GitHub Actions job is done, clean up any environment variables that
 * may have been set by the configure-aws-credentials steps in the job.
 *
 * Environment variables are not intended to be shared across different jobs in
 * the same GitHub Actions workflow: GitHub Actions documentation states that
 * each job runs in a fresh instance.  However, doing our own cleanup will
 * give us additional assurance that these environment variables are not shared
 * with any other jobs.
 */

export function cleanup() {
  const outputEnvCredentials = getBooleanInput('output-env-credentials', { required: false, default: true });
  const outputConfigFiles = getBooleanInput('output-config-files', { required: false });
  const awsConfigFilePathInput = core.getInput('aws-config-file-path', { required: false });
  const awsSharedCredentialsFilePathInput = core.getInput('aws-shared-credentials-file-path', { required: false });
  const awsConfigFilePath = awsConfigFilePathInput ? expandPath(awsConfigFilePathInput) : undefined;
  const awsSharedCredentialsFilePath = awsSharedCredentialsFilePathInput
    ? expandPath(awsSharedCredentialsFilePathInput)
    : undefined;

  // Clean up config files if they were created (only custom paths, not default ~/.aws/*)
  if (outputConfigFiles) {
    try {
      // Only clean up if custom paths were used (environment variables will be set)
      // Default paths (~/.aws/*) are not cleaned up and don't set environment variables
      const configFile = process.env.AWS_CONFIG_FILE;
      const credentialsFile = process.env.AWS_SHARED_CREDENTIALS_FILE;

      // If custom paths were provided, clean them up
      if (awsConfigFilePath && fs.existsSync(awsConfigFilePath)) {
        // Only remove if it's a temp directory we created, otherwise just the file
        const configDir = path.dirname(awsConfigFilePath);
        if (configDir.includes('aws-config-')) {
          fs.rmSync(configDir, { recursive: true, force: true });
          core.debug(`Removed AWS config file directory: ${configDir}`);
        } else {
          fs.unlinkSync(awsConfigFilePath);
          core.debug(`Removed AWS config file: ${awsConfigFilePath}`);
        }
      } else if (configFile && fs.existsSync(configFile)) {
        // Fallback to environment variable if custom path wasn't provided but env var is set
        // If env var is set, we created this file, so we should clean it up
        const stats = fs.statSync(configFile);
        if (stats.isDirectory()) {
          // If it's a directory, only remove if it's a temp directory we created
          if (configFile.includes('aws-config-')) {
            fs.rmSync(configFile, { recursive: true, force: true });
            core.debug(`Removed AWS config file directory: ${configFile}`);
          }
        } else {
          // It's a file - remove it and check if we should remove the parent directory
          const configDir = path.dirname(configFile);
          fs.unlinkSync(configFile);
          core.debug(`Removed AWS config file: ${configFile}`);
          // Only remove parent directory if it's a temp directory we created
          if (configDir.includes('aws-config-')) {
            try {
              // Only remove if directory is empty (or force remove if it's our temp dir)
              fs.rmSync(configDir, { recursive: true, force: true });
              core.debug(`Removed AWS config file directory: ${configDir}`);
            } catch {
              // Ignore errors removing directory (may not be empty or may not exist)
            }
          }
        }
      }

      if (awsSharedCredentialsFilePath && fs.existsSync(awsSharedCredentialsFilePath)) {
        // Only remove if it's a temp directory we created, otherwise just the file
        const credsDir = path.dirname(awsSharedCredentialsFilePath);
        if (credsDir.includes('aws-config-')) {
          // Directory already removed above if same as configDir
          if (credsDir !== path.dirname(awsConfigFilePath || '')) {
            fs.rmSync(credsDir, { recursive: true, force: true });
            core.debug(`Removed AWS credentials file directory: ${credsDir}`);
          }
        } else {
          fs.unlinkSync(awsSharedCredentialsFilePath);
          core.debug(`Removed AWS credentials file: ${awsSharedCredentialsFilePath}`);
        }
      } else if (credentialsFile && fs.existsSync(credentialsFile)) {
        // Fallback to environment variable if custom path wasn't provided but env var is set
        // If env var is set, we created this file, so we should clean it up
        const stats = fs.statSync(credentialsFile);
        if (stats.isDirectory()) {
          // If it's a directory, only remove if it's a temp directory we created
          if (credentialsFile.includes('aws-config-')) {
            fs.rmSync(credentialsFile, { recursive: true, force: true });
            core.debug(`Removed AWS shared credentials file directory: ${credentialsFile}`);
          }
        } else {
          // It's a file - remove it and check if we should remove the parent directory
          const credsDir = path.dirname(credentialsFile);
          fs.unlinkSync(credentialsFile);
          core.debug(`Removed AWS shared credentials file: ${credentialsFile}`);
          // Only remove parent directory if it's a temp directory we created
          // Also check if it's different from the config file directory to avoid double removal
          if (credsDir.includes('aws-config-') && credsDir !== path.dirname(awsConfigFilePath || '')) {
            try {
              // Only remove if directory is empty (or force remove if it's our temp dir)
              fs.rmSync(credsDir, { recursive: true, force: true });
              core.debug(`Removed AWS shared credentials file directory: ${credsDir}`);
            } catch {
              // Ignore errors removing directory (may not be empty or may not exist)
            }
          }
        }
      }

      // Only unset environment variables if they were set (custom paths)
      if (configFile || credentialsFile) {
        core.exportVariable('AWS_CONFIG_FILE', '');
        core.exportVariable('AWS_SHARED_CREDENTIALS_FILE', '');
      }
    } catch (error) {
      core.warning(`Failed to remove AWS config files: ${errorMessage(error)}`);
    }
  }

  // Only attempt to change environment variables if we changed them in the first place
  if (outputEnvCredentials) {
    try {
      // The GitHub Actions toolkit does not have an option to completely unset
      // environment variables, so we overwrite the current value with an empty
      // string. The AWS CLI and AWS SDKs will behave correctly: they treat an
      // empty string value as if the environment variable does not exist.
      core.exportVariable('AWS_ACCESS_KEY_ID', '');
      core.exportVariable('AWS_SECRET_ACCESS_KEY', '');
      core.exportVariable('AWS_SESSION_TOKEN', '');
      core.exportVariable('AWS_DEFAULT_REGION', '');
      core.exportVariable('AWS_REGION', '');
    } catch (error) {
      core.setFailed(errorMessage(error));
    }
  }
}

/* c8 ignore start */
if (require.main === module) {
  try {
    cleanup();
  } catch (error) {
    core.setFailed(errorMessage(error));
  }
}
