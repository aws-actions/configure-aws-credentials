import * as core from '@actions/core';
import type { Credentials } from '@aws-sdk/client-sts';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import type { CredentialsClient } from './CredentialsClient';

const MAX_TAG_VALUE_LENGTH = 256;
const SANITIZATION_CHARACTER = '_';
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+/;

export function translateEnvVariables() {
  const envVars = [
    'AWS_REGION',
    'ROLE_TO_ASSUME',
    'WEB_IDENTITY_TOKEN_FILE',
    'ROLE_CHAINING',
    'AUDIENCE',
    'HTTP_PROXY',
    'MASK_AWS_ACCOUNT_ID',
    'ROLE_DURATION_SECONDS',
    'ROLE_EXTERNAL_ID',
    'ROLE_SESSION_NAME',
    'ROLE_SKIP_SESSION_TAGGING',
    'INLINE_SESSION_POLICY',
    'MANAGED_SESSION_POLICIES',
    'OUTPUT_CREDENTIALS',
    'UNSET_CURRENT_CREDENTIALS',
    'DISABLE_RETRY',
    'RETRY_MAX_ATTEMPTS',
    'SPECIAL_CHARACTERS_WORKAROUND',
    'USE_EXISTING_CREDENTIALS',
  ];
  // Treat HTTPS_PROXY as HTTP_PROXY. Precedence is HTTPS_PROXY > HTTP_PROXY
  process.env.HTTP_PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || undefined;
  for (const envVar of envVars) {
    if (process.env[envVar]) {
      const inputKey = `INPUT_${envVar.replace(/_/g, '-')}`;
      process.env[inputKey] = process.env[inputKey] || process.env[envVar];
    }
  }
}

// Configure the AWS CLI and AWS SDKs using environment variables and set them as secrets.
// Setting the credentials as secrets masks them in Github Actions logs
export function exportCredentials(
  creds?: Partial<Credentials>,
  outputCredentials?: boolean,
  outputEnvCredentials?: boolean,
) {
  if (creds?.AccessKeyId) {
    core.setSecret(creds.AccessKeyId);
  }

  if (creds?.SecretAccessKey) {
    core.setSecret(creds.SecretAccessKey);
  }

  if (creds?.SessionToken) {
    core.setSecret(creds.SessionToken);
  }

  if (outputEnvCredentials) {
    if (creds?.AccessKeyId) {
      core.exportVariable('AWS_ACCESS_KEY_ID', creds.AccessKeyId);
    }

    if (creds?.SecretAccessKey) {
      core.exportVariable('AWS_SECRET_ACCESS_KEY', creds.SecretAccessKey);
    }

    if (creds?.SessionToken) {
      core.exportVariable('AWS_SESSION_TOKEN', creds.SessionToken);
    } else if (process.env.AWS_SESSION_TOKEN) {
      // clear session token from previous credentials action
      core.exportVariable('AWS_SESSION_TOKEN', '');
    }
  }

  if (outputCredentials) {
    if (creds?.AccessKeyId) {
      core.setOutput('aws-access-key-id', creds.AccessKeyId);
    }
    if (creds?.SecretAccessKey) {
      core.setOutput('aws-secret-access-key', creds.SecretAccessKey);
    }
    if (creds?.SessionToken) {
      core.setOutput('aws-session-token', creds.SessionToken);
    }
    if (creds?.Expiration) {
      core.setOutput('aws-expiration', creds.Expiration);
    }
  }
}

export function unsetCredentials(outputEnvCredentials?: boolean) {
  if (outputEnvCredentials) {
    core.exportVariable('AWS_ACCESS_KEY_ID', '');
    core.exportVariable('AWS_SECRET_ACCESS_KEY', '');
    core.exportVariable('AWS_SESSION_TOKEN', '');
    core.exportVariable('AWS_REGION', '');
    core.exportVariable('AWS_DEFAULT_REGION', '');
  }
}

export function exportRegion(region: string, outputEnvCredentials?: boolean) {
  if (outputEnvCredentials) {
    core.exportVariable('AWS_DEFAULT_REGION', region);
    core.exportVariable('AWS_REGION', region);
  }
}

// Obtains account ID from STS Client and sets it as output
export async function exportAccountId(credentialsClient: CredentialsClient, maskAccountId?: boolean) {
  const client = credentialsClient.stsClient;
  const identity = await client.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account;
  const arn = identity.Arn;
  if (!accountId || !arn) {
    throw new Error('Could not get Account ID or ARN from STS. Did you set credentials?');
  }
  if (maskAccountId) {
    core.setSecret(accountId);
    core.setSecret(arn);
  }
  core.setOutput('aws-account-id', accountId);
  core.setOutput('authenticated-arn', arn);
  return accountId;
}

// Tags have a more restrictive set of acceptable characters than GitHub environment variables can.
// This replaces anything not conforming to the tag restrictions by inverting the regular expression.
// See the AWS documentation for constraint specifics https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html.
export function sanitizeGitHubVariables(name: string) {
  const nameWithoutSpecialCharacters = name.replace(/[^\p{L}\p{Z}\p{N}_.:/=+\-@]/gu, SANITIZATION_CHARACTER);
  const nameTruncated = nameWithoutSpecialCharacters.slice(0, MAX_TAG_VALUE_LENGTH);
  return nameTruncated;
}

export async function defaultSleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
let sleep = defaultSleep;

export function withsleep(s: typeof sleep) {
  sleep = s;
}

export function reset() {
  sleep = defaultSleep;
}

export function verifyKeys(creds: Partial<Credentials> | undefined) {
  if (!creds) {
    return false;
  }
  if (creds.AccessKeyId) {
    if (SPECIAL_CHARS_REGEX.test(creds.AccessKeyId)) {
      core.debug('AccessKeyId contains special characters.');
      return false;
    }
  }
  if (creds.SecretAccessKey) {
    if (SPECIAL_CHARS_REGEX.test(creds.SecretAccessKey)) {
      core.debug('SecretAccessKey contains special characters.');
      return false;
    }
  }
  return true;
}

// Retries the promise with exponential backoff if the error isRetryable up to maxRetries time.
export async function retryAndBackoff<T>(
  fn: () => Promise<T>,
  isRetryable: boolean,
  maxRetries = 12,
  retries = 0,
  base = 50,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRetryable) {
      throw err;
    }
    // It's retryable, so sleep and retry.
    await sleep(Math.random() * (2 ** retries * base));
    retries += 1;
    if (retries >= maxRetries) {
      throw err;
    }
    return await retryAndBackoff(fn, isRetryable, maxRetries, retries, base);
  }
}

/* c8 ignore start */
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isDefined<T>(i: T | undefined | null): i is T {
  return i !== undefined && i !== null;
}
/* c8 ignore stop */

export async function areCredentialsValid(credentialsClient: CredentialsClient) {
  const client = credentialsClient.stsClient;
  try {
    const identity = await client.send(new GetCallerIdentityCommand({}));
    if (identity.Account) {
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}
