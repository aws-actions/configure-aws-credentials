import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';
import type { AssumeRoleCommandInput, STSClient, Tag } from '@aws-sdk/client-sts';
import { AssumeRoleCommand, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts';
import type { CredentialsClient } from './CredentialsClient';
import { errorMessage, isDefined, sanitizeGitHubVariables } from './helpers';

async function assumeRoleWithOIDC(params: AssumeRoleCommandInput, client: STSClient, webIdentityToken: string) {
  delete params.Tags;
  delete params.TransitiveTagKeys;
  core.info('Assuming role with OIDC');
  try {
    const creds = await client.send(
      new AssumeRoleWithWebIdentityCommand({
        ...params,
        WebIdentityToken: webIdentityToken,
      }),
    );
    return creds;
  } catch (error) {
    throw new Error(`Could not assume role with OIDC: ${errorMessage(error)}`);
  }
}

async function assumeRoleWithWebIdentityTokenFile(
  params: AssumeRoleCommandInput,
  client: STSClient,
  webIdentityTokenFile: string,
  workspace: string,
) {
  core.debug(
    'webIdentityTokenFile provided. Will call sts:AssumeRoleWithWebIdentity and take session tags from token contents.',
  );
  const webIdentityTokenFilePath = path.isAbsolute(webIdentityTokenFile)
    ? webIdentityTokenFile
    : path.join(workspace, webIdentityTokenFile);
  if (!fs.existsSync(webIdentityTokenFilePath)) {
    throw new Error(`Web identity token file does not exist: ${webIdentityTokenFilePath}`);
  }
  core.info('Assuming role with web identity token file');
  try {
    const webIdentityToken = fs.readFileSync(webIdentityTokenFilePath, 'utf8');
    delete params.Tags;
    delete params.TransitiveTagKeys;
    const creds = await client.send(
      new AssumeRoleWithWebIdentityCommand({
        ...params,
        WebIdentityToken: webIdentityToken,
      }),
    );
    return creds;
  } catch (error) {
    throw new Error(`Could not assume role with web identity token file: ${errorMessage(error)}`);
  }
}

async function assumeRoleWithCredentials(params: AssumeRoleCommandInput, client: STSClient) {
  core.info('Assuming role with user credentials');
  try {
    const creds = await client.send(new AssumeRoleCommand({ ...params }));
    return creds;
  } catch (error) {
    throw new Error(`Could not assume role with user credentials: ${errorMessage(error)}`);
  }
}

export interface assumeRoleParams {
  credentialsClient: CredentialsClient;
  roleToAssume: string;
  roleDuration: number;
  roleSessionName: string;
  roleSkipSessionTagging?: boolean;
  transitiveTagKeys?: string[];
  sourceAccountId?: string;
  roleExternalId?: string;
  webIdentityTokenFile?: string;
  webIdentityToken?: string;
  inlineSessionPolicy?: string;
  managedSessionPolicies?: { arn: string }[];
  customTags?: string;
}

const TAG_KEY_REGEX = /^[\p{L}\p{Z}\p{N}_.:/=+\-@]+$/u;
const TAG_VALUE_REGEX = /^[\p{L}\p{Z}\p{N}_.:/=+\-@]*$/u;
const MAX_TAG_KEY_LENGTH = 128;
const MAX_TAG_VALUE_LENGTH = 256;
const MAX_SESSION_TAGS = 50;

// Identity/audit primitives. Always emitted and cannot be overridden by custom-tags.
const PROTECTED_TAG_SOURCES: ReadonlyArray<{ key: string; envVar: string }> = [
  { key: 'Repository', envVar: 'GITHUB_REPOSITORY' },
  { key: 'Workflow', envVar: 'GITHUB_WORKFLOW' },
  { key: 'Action', envVar: 'GITHUB_ACTION' },
  { key: 'Actor', envVar: 'GITHUB_ACTOR' },
  { key: 'Commit', envVar: 'GITHUB_SHA' },
  { key: 'Branch', envVar: 'GITHUB_REF' },
];

// Convenience metadata. Custom-tags may override (suppresses the default for that key).
// Listed in priority order; lower-priority entries are dropped first if the user's custom-tags
// would push the total above MAX_SESSION_TAGS.
const OVERRIDEABLE_TAG_SOURCES_BY_PRIORITY: ReadonlyArray<{ key: string; envVar: string }> = [
  { key: 'EventName', envVar: 'GITHUB_EVENT_NAME' },
  { key: 'BaseRef', envVar: 'GITHUB_BASE_REF' },
  { key: 'HeadRef', envVar: 'GITHUB_HEAD_REF' },
  { key: 'RefName', envVar: 'GITHUB_REF_NAME' },
  { key: 'RunId', envVar: 'GITHUB_RUN_ID' },
  { key: 'RefType', envVar: 'GITHUB_REF_TYPE' },
  { key: 'Job', envVar: 'GITHUB_JOB' },
  { key: 'TriggeringActor', envVar: 'GITHUB_TRIGGERING_ACTOR' },
];

const PROTECTED_TAG_KEYS = new Set<string>(['GitHub', ...PROTECTED_TAG_SOURCES.map((s) => s.key)]);

export function parseAndValidateCustomTags(customTags: string, existingTags: Tag[]): Tag[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(customTags);
  } catch {
    throw new Error('custom-tags: input is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('custom-tags: input must be a JSON object (not an array or primitive)');
  }

  const newTags: Tag[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'object') {
      throw new Error(
        `custom-tags: value for key '${key}' must be a string, number, or boolean (not an object or array)`,
      );
    }

    const stringValue = String(value);

    if (key.length === 0 || key.length > MAX_TAG_KEY_LENGTH) {
      throw new Error(`custom-tags: key '${key}' must be between 1 and ${MAX_TAG_KEY_LENGTH} characters`);
    }
    if (stringValue.length > MAX_TAG_VALUE_LENGTH) {
      throw new Error(
        `custom-tags: value for key '${key}' exceeds maximum length of ${MAX_TAG_VALUE_LENGTH} characters`,
      );
    }
    if (!TAG_KEY_REGEX.test(key)) {
      throw new Error(
        `custom-tags: key '${key}' contains invalid characters. Allowed: unicode letters, digits, spaces, and _.:/=+-@`,
      );
    }
    if (stringValue.length > 0 && !TAG_VALUE_REGEX.test(stringValue)) {
      throw new Error(
        `custom-tags: value for key '${key}' contains invalid characters. Allowed: unicode letters, digits, spaces, and _.:/=+-@`,
      );
    }
    if (PROTECTED_TAG_KEYS.has(key)) {
      throw new Error(
        `custom-tags: key '${key}' conflicts with a protected session tag set by this action and cannot be overridden`,
      );
    }

    newTags.push({ Key: key, Value: stringValue });
  }

  if (existingTags.length + newTags.length > MAX_SESSION_TAGS) {
    throw new Error(
      `custom-tags: total session tags (${existingTags.length + newTags.length}) would exceed the AWS limit of ${MAX_SESSION_TAGS}`,
    );
  }

  return newTags;
}

export async function assumeRole(params: assumeRoleParams) {
  const {
    credentialsClient,
    sourceAccountId,
    roleToAssume,
    roleExternalId,
    roleDuration,
    roleSessionName,
    roleSkipSessionTagging,
    transitiveTagKeys,
    webIdentityTokenFile,
    webIdentityToken,
    inlineSessionPolicy,
    managedSessionPolicies,
    customTags,
  } = { ...params };

  // Load GitHub environment variables
  const { GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_SHA, GITHUB_WORKSPACE } = process.env;
  if (!GITHUB_REPOSITORY || !GITHUB_WORKFLOW || !GITHUB_ACTION || !GITHUB_ACTOR || !GITHUB_SHA || !GITHUB_WORKSPACE) {
    throw new Error('Missing required environment variables. Are you running in GitHub Actions?');
  }

  // Build session tags. Values are sanitized because the AWS tag value spec is more
  // restrictive than permissible characters in environment variables.
  const protectedTags: Tag[] = [{ Key: 'GitHub', Value: 'Actions' }];
  for (const { key, envVar } of PROTECTED_TAG_SOURCES) {
    const value = process.env[envVar];
    if (value) {
      protectedTags.push({ Key: key, Value: sanitizeGitHubVariables(value) });
    }
  }

  const parsedCustomTags: Tag[] = customTags ? parseAndValidateCustomTags(customTags, protectedTags) : [];
  const customTagKeys = new Set(parsedCustomTags.map((t) => t.Key));

  const availableOverrideableSlots = MAX_SESSION_TAGS - protectedTags.length - parsedCustomTags.length;
  const overrideableTags: Tag[] = [];
  for (const { key, envVar } of OVERRIDEABLE_TAG_SOURCES_BY_PRIORITY) {
    if (overrideableTags.length >= availableOverrideableSlots) break;
    if (customTagKeys.has(key)) continue;
    const value = process.env[envVar];
    if (value) {
      overrideableTags.push({ Key: key, Value: sanitizeGitHubVariables(value) });
    }
  }

  const tagArray: Tag[] = [...protectedTags, ...overrideableTags, ...parsedCustomTags];

  const tags = roleSkipSessionTagging ? undefined : tagArray;
  if (!tags) {
    core.debug('Role session tagging has been skipped.');
  } else {
    core.debug(`${tags.length} role session tags are being used:`);
  }

  //only populate transitiveTagKeys array if user is actually using session tagging
  const transitiveTagKeysArray = roleSkipSessionTagging
    ? undefined
    : transitiveTagKeys?.filter((key) => tags?.some((tag) => tag.Key === key));

  // Calculate role ARN from name and account ID (currently only supports `aws` partition)
  let roleArn = roleToAssume;
  if (!roleArn.startsWith('arn:aws')) {
    assert(
      isDefined(sourceAccountId),
      'Source Account ID is needed if the Role Name is provided and not the Role Arn.',
    );
    roleArn = `arn:aws:iam::${sourceAccountId}:role/${roleArn}`;
  }

  // Ready common parameters to assume role
  const commonAssumeRoleParams: AssumeRoleCommandInput = {
    RoleArn: roleArn,
    RoleSessionName: roleSessionName,
    DurationSeconds: roleDuration,
    Tags: tags ? tags : undefined,
    TransitiveTagKeys: transitiveTagKeysArray ? transitiveTagKeysArray : undefined,
    ExternalId: roleExternalId ? roleExternalId : undefined,
    Policy: inlineSessionPolicy ? inlineSessionPolicy : undefined,
    PolicyArns: managedSessionPolicies?.length ? managedSessionPolicies : undefined,
  };
  const keys = Object.keys(commonAssumeRoleParams) as Array<keyof typeof commonAssumeRoleParams>;
  keys.forEach((k) => {
    if (commonAssumeRoleParams[k] === undefined) {
      delete commonAssumeRoleParams[k];
    }
  });

  // Instantiate STS client
  const stsClient = credentialsClient.stsClient;

  // Assume role using one of three methods
  if (!!webIdentityToken) {
    return assumeRoleWithOIDC(commonAssumeRoleParams, stsClient, webIdentityToken);
  }
  if (!!webIdentityTokenFile) {
    return assumeRoleWithWebIdentityTokenFile(
      commonAssumeRoleParams,
      stsClient,
      webIdentityTokenFile,
      GITHUB_WORKSPACE,
    );
  }
  return assumeRoleWithCredentials(commonAssumeRoleParams, stsClient);
}
