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

  const reservedKeys = new Set(existingTags.map((tag) => tag.Key));
  const newTags: Tag[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'object' && value !== null) {
      throw new Error(`custom-tags: value for key '${key}' must be a string, number, or boolean (not an object or array)`);
    }

    const stringValue = String(value);

    if (key.length === 0 || key.length > MAX_TAG_KEY_LENGTH) {
      throw new Error(`custom-tags: key '${key}' must be between 1 and ${MAX_TAG_KEY_LENGTH} characters`);
    }
    if (stringValue.length > MAX_TAG_VALUE_LENGTH) {
      throw new Error(`custom-tags: value for key '${key}' exceeds maximum length of ${MAX_TAG_VALUE_LENGTH} characters`);
    }
    if (!TAG_KEY_REGEX.test(key)) {
      throw new Error(`custom-tags: key '${key}' contains invalid characters. Allowed: unicode letters, digits, spaces, and _.:/=+-@`);
    }
    if (stringValue.length > 0 && !TAG_VALUE_REGEX.test(stringValue)) {
      throw new Error(`custom-tags: value for key '${key}' contains invalid characters. Allowed: unicode letters, digits, spaces, and _.:/=+-@`);
    }
    if (reservedKeys.has(key)) {
      throw new Error(`custom-tags: key '${key}' conflicts with a default session tag set by this action and cannot be overridden`);
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

  // Load role session tags
  const tagArray: Tag[] = [
    { Key: 'GitHub', Value: 'Actions' },
    { Key: 'Repository', Value: GITHUB_REPOSITORY },
    { Key: 'Workflow', Value: sanitizeGitHubVariables(GITHUB_WORKFLOW) },
    { Key: 'Action', Value: GITHUB_ACTION },
    { Key: 'Actor', Value: sanitizeGitHubVariables(GITHUB_ACTOR) },
    { Key: 'Commit', Value: GITHUB_SHA },
  ];

  if (process.env.GITHUB_REF) {
    tagArray.push({
      Key: 'Branch',
      Value: sanitizeGitHubVariables(process.env.GITHUB_REF),
    });
  }

  if (customTags) {
    const parsed = parseAndValidateCustomTags(customTags, tagArray);
    tagArray.push(...parsed);
  }

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
