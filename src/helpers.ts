import * as core from '@actions/core';
import type { Credentials } from '@aws-sdk/client-sts';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import type { CredentialsClient } from './CredentialsClient';

const MAX_TAG_VALUE_LENGTH = 256;
const SANITIZATION_CHARACTER = '_';

export function sanitizeGithubActor(actor: string) {
  // In some circumstances the actor may contain square brackets. For example, if they're a bot ('[bot]')
  // Square brackets are not allowed in AWS session tags
  return actor.replace(/\[|\]/g, SANITIZATION_CHARACTER);
}

export function sanitizeGithubWorkflowName(name: string) {
  // Workflow names can be almost any valid UTF-8 string, but tags are more restrictive.
  // This replaces anything not conforming to the tag restrictions by inverting the regular expression.
  // See the AWS documentation for constraint specifics https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html.
  const nameWithoutSpecialCharacters = name.replace(/[^\p{L}\p{Z}\p{N}_:/=+.-@-]/gu, SANITIZATION_CHARACTER);
  const nameTruncated = nameWithoutSpecialCharacters.slice(0, MAX_TAG_VALUE_LENGTH);
  return nameTruncated;
}
/* c8 ignore start */
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isDefined<T>(i: T | undefined | null): i is T {
  return i !== undefined && i !== null;
}
/* c8 ignore stop */

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

// retryAndBackoff retries with exponential backoff the promise if the error isRetryable upto maxRetries time.
export async function retryAndBackoff<T>(
  fn: () => Promise<T>,
  isRetryable: boolean,
  retries = 0,
  maxRetries = 12,
  base = 50
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRetryable) {
      throw err;
    }
    // It's retryable, so sleep and retry.
    await sleep(Math.random() * (Math.pow(2, retries) * base));
    retries += 1;
    if (retries === maxRetries) {
      throw err;
    }
    return await retryAndBackoff(fn, isRetryable, retries, maxRetries, base);
  }
}

export function exportCredentials(creds?: Partial<Credentials>) {
  // Configure the AWS CLI and AWS SDKs using environment variables and set them as secrets.
  // Setting the credentials as secrets masks them in Github Actions logs

  // AWS_ACCESS_KEY_ID:
  // Specifies an AWS access key associated with an IAM user or role
  if (creds?.AccessKeyId) {
    core.setSecret(creds.AccessKeyId);
    core.exportVariable('AWS_ACCESS_KEY_ID', creds.AccessKeyId);
  }

  // AWS_SECRET_ACCESS_KEY:
  // Specifies the secret key associated with the access key. This is essentially the "password" for the access key.
  if (creds?.SecretAccessKey) {
    core.setSecret(creds.SecretAccessKey);
    core.exportVariable('AWS_SECRET_ACCESS_KEY', creds.SecretAccessKey);
  }

  // AWS_SESSION_TOKEN:
  // Specifies the session token value that is required if you are using temporary security credentials.
  if (creds?.SessionToken) {
    core.setSecret(creds.SessionToken);
    core.exportVariable('AWS_SESSION_TOKEN', creds.SessionToken);
  } else if (process.env['AWS_SESSION_TOKEN']) {
    // clear session token from previous credentials action
    core.exportVariable('AWS_SESSION_TOKEN', '');
  }
}

export function exportRegion(region: string) {
  // AWS_DEFAULT_REGION and AWS_REGION:
  // Specifies the AWS Region to send requests to
  core.exportVariable('AWS_DEFAULT_REGION', region);
  core.exportVariable('AWS_REGION', region);
}

export async function exportAccountId(credentialsClient: CredentialsClient, maskAccountId?: string) {
  // Get the AWS account ID
  const client = credentialsClient.getStsClient();
  const identity = await client.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account;
  if (!accountId) {
    throw new Error('Could not get Account ID from STS. Did you set credentials?');
  }
  if (maskAccountId) {
    core.setSecret(accountId);
  }
  core.setOutput('aws-account-id', accountId);
  return accountId;
}
