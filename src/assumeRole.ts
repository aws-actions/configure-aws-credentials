import assert from 'assert';
import fs from 'fs';
import path from 'path';
import * as core from '@actions/core';
import { AssumeRoleCommandInput, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts';
import { errorMessage, getStsClient, isDefined } from './helpers';

const SANITIZATION_CHARACTER = '_';
const MAX_TAG_VALUE_LENGTH = 256;

function sanitizeGithubActor(actor: string) {
  // In some circumstances the actor may contain square brackets. For example, if they're a bot ('[bot]')
  // Square brackets are not allowed in AWS session tags
  return actor.replace(/\[|\]/g, SANITIZATION_CHARACTER);
}

function sanitizeGithubWorkflowName(name: string) {
  // Workflow names can be almost any valid UTF-8 string, but tags are more restrictive.
  // This replaces anything not conforming to the tag restrictions by inverting the regular expression.
  // See the AWS documentation for constraint specifics https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html.
  const nameWithoutSpecialCharacters = name.replace(/[^\p{L}\p{Z}\p{N}_:/=+.-@-]/gu, SANITIZATION_CHARACTER);
  const nameTruncated = nameWithoutSpecialCharacters.slice(0, MAX_TAG_VALUE_LENGTH);
  return nameTruncated;
}

export interface assumeRoleParams {
  region: string;
  roleToAssume: string;
  roleDurationSeconds: number;
  roleSessionName: string;
  roleSkipSessionTagging?: boolean;
  sourceAccountId?: string;
  roleExternalId?: string;
  webIdentityTokenFile?: string;
  webIdentityToken?: string;
}

export async function assumeRole(params: assumeRoleParams) {
  // Assume a role to get short-lived credentials using longer-lived credentials.
  const {
    sourceAccountId,
    roleToAssume,
    roleExternalId,
    roleDurationSeconds,
    roleSessionName,
    region,
    roleSkipSessionTagging,
    webIdentityTokenFile,
    webIdentityToken,
  } = { ...params };

  const { GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_SHA, GITHUB_WORKSPACE } = process.env;
  if (!GITHUB_REPOSITORY || !GITHUB_WORKFLOW || !GITHUB_ACTION || !GITHUB_ACTOR || !GITHUB_SHA || !GITHUB_WORKSPACE) {
    throw new Error('Missing required environment variables. Are you running in GitHub Actions?');
  }

  let RoleArn = roleToAssume;
  if (!RoleArn.startsWith('arn:aws')) {
    // Supports only 'aws' partition. Customers in other partitions ('aws-cn') will need to provide full ARN
    assert(
      isDefined(sourceAccountId),
      'Source Account ID is needed if the Role Name is provided and not the Role Arn.'
    );
    RoleArn = `arn:aws:iam::${sourceAccountId}:role/${RoleArn}`;
  }

  const tagArray = [
    { Key: 'GitHub', Value: 'Actions' },
    { Key: 'Repository', Value: GITHUB_REPOSITORY },
    { Key: 'Workflow', Value: sanitizeGithubWorkflowName(GITHUB_WORKFLOW) },
    { Key: 'Action', Value: GITHUB_ACTION },
    { Key: 'Actor', Value: sanitizeGithubActor(GITHUB_ACTOR) },
    { Key: 'Commit', Value: GITHUB_SHA },
  ];

  if (process.env.GITHUB_REF) {
    tagArray.push({ Key: 'Branch', Value: process.env.GITHUB_REF });
  }

  const Tags = roleSkipSessionTagging ? undefined : tagArray;
  if (!Tags) {
    core.debug('Role session tagging has been skipped.');
  } else {
    core.debug(Tags.length + ' role session tags are being used.');
  }

  const commonAssumeRoleParams: AssumeRoleCommandInput = {
    RoleArn,
    RoleSessionName: roleSessionName,
    DurationSeconds: roleDurationSeconds,
    Tags,
    ExternalId: roleExternalId,
  };
  const keys = Object.keys(commonAssumeRoleParams) as Array<keyof typeof commonAssumeRoleParams>;
  keys.forEach((k) => commonAssumeRoleParams[k] === undefined && delete commonAssumeRoleParams[k]);

  let assumeRoleCommand: AssumeRoleWithWebIdentityCommand;
  switch (true) {
    case !!webIdentityToken: {
      delete commonAssumeRoleParams.Tags;
      assumeRoleCommand = new AssumeRoleWithWebIdentityCommand({
        ...commonAssumeRoleParams,
        WebIdentityToken: webIdentityToken,
      });
      break;
    }
    case !!webIdentityTokenFile: {
      core.debug(
        'webIdentityTokenFile provided. Will call sts:AssumeRoleWithWebIdentity and take session tags from token contents.'
      );

      const webIdentityTokenFilePath = path.isAbsolute(webIdentityTokenFile!)
        ? webIdentityTokenFile!
        : path.join(GITHUB_WORKSPACE, webIdentityTokenFile!);
      if (!fs.existsSync(webIdentityTokenFilePath)) {
        throw new Error(`Web identity token file does not exist: ${webIdentityTokenFilePath}`);
      }

      try {
        const widt = await fs.promises.readFile(webIdentityTokenFilePath, 'utf8');
        delete commonAssumeRoleParams.Tags;
        assumeRoleCommand = new AssumeRoleWithWebIdentityCommand({
          ...commonAssumeRoleParams,
          WebIdentityToken: widt,
        });
      } catch (error) {
        throw new Error(`Web identity token file could not be read: ${errorMessage(error)}`);
      }
      break;
    }
    default:
      throw new Error('No web identity token or web identity token file provided.');
  }

  const sts = getStsClient(region);
  return sts.send(assumeRoleCommand);
}
