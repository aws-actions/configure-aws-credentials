import { STSClient } from '@aws-sdk/client-sts';

const MAX_TAG_VALUE_LENGTH = 256;
const SANITIZATION_CHARACTER = '_';

let stsclient: STSClient | undefined;

export function getStsClient(region: string, customUserAgent?: string) {
  if (!stsclient) {
    stsclient = new STSClient({
      region,
      ...(customUserAgent ? { customUserAgent } : {}),
    });
  }
  return stsclient;
}

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
