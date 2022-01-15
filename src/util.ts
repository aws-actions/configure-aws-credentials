import { STSClient } from '@aws-sdk/client-sts';

const MAX_TAG_VALUE_LENGTH = 256;
const SANITIZATION_CHARACTER = '_';
const USER_AGENT = 'configure-aws-credentials-for-github-actions';

let stsclient: STSClient | undefined;

export function getStsClient(region: string) {
  if (!stsclient) {
    stsclient = new STSClient({
      region,
      customUserAgent: USER_AGENT,
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

export function isString(i: unknown): i is string {
  return typeof i === 'string';
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
