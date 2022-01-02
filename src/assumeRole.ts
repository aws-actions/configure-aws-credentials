import { errorMessage, getStsClient, isString, sanitizeGithubActor, sanitizeGithubWorkflowName } from './util';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  AssumeRoleCommand,
  AssumeRoleCommandInput,
  AssumeRoleCommandOutput,
  AssumeRoleWithWebIdentityCommand,
  AssumeRoleWithWebIdentityCommandInput,
  AssumeRoleWithWebIdentityCommandOutput,
} from '@aws-sdk/client-sts';
import * as asyncRetry from 'async-retry';

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
  roleToAssumeRetries: number;
  roleToAssumeRetriesFactor: number;
}

function isRetryableError(e: NodeJS.ErrnoException) {
  return ['IDPCommunicationErrorException', 'InvalidIdentityToken'].includes(e.code ?? '');
}

async function retry(
  send: Promise<AssumeRoleWithWebIdentityCommandOutput | AssumeRoleCommandOutput>,
  roleToAssumeRetries: number,
  roleToAssumeRetriesFactor: number
) {
  const roleCredentials = await asyncRetry(
    async bail => {
      try {
        return (await send).Credentials;
      } catch (e) {
        if (!isRetryableError(e as NodeJS.ErrnoException)) {
          bail(new Error(errorMessage(e)));
          return;
        }
        throw new Error(errorMessage(e));
      }
    },
    {
      retries: roleToAssumeRetries,
      factor: roleToAssumeRetriesFactor,
      randomize: true,
      onRetry: function (err) {
        core.warning(`Retrying. ${err.message}`);
      },
    }
  );
  return roleCredentials;
}

export async function assumeRole(params: assumeRoleParams) {
  // Assume a role to get short-lived credentials using longer-lived credentials.
  const {
    region,
    roleToAssume,
    roleDurationSeconds,
    roleSessionName,
    roleSkipSessionTagging,
    sourceAccountId,
    roleExternalId,
    webIdentityTokenFile,
    webIdentityToken,
    roleToAssumeRetries,
    roleToAssumeRetriesFactor,
  } = { ...params };
  const { GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_SHA, GITHUB_WORKSPACE } = process.env;

  if (
    !isString(GITHUB_REPOSITORY) ||
    !isString(GITHUB_WORKFLOW) ||
    !isString(GITHUB_ACTION) ||
    !isString(GITHUB_ACTOR) ||
    !isString(GITHUB_SHA) ||
    !isString(GITHUB_WORKSPACE)
  ) {
    throw new Error('Missing required environment value. Are you running in GitHub Actions?');
  }

  const client = getStsClient(region);
  let roleArn = roleToAssume;
  if (!roleArn.startsWith('arn:aws')) {
    // Supports only 'aws' partition. Customers in other partitions ('aws-cn') will need to provide full ARN
    if (sourceAccountId === undefined) {
      throw new Error('Source Account ID is needed if the Role Name is provided and not the Role Arn.');
    }
    roleArn = `arn:aws:iam::${sourceAccountId}:role/${roleArn}`;
  }

  const tagArray = [
    { Key: 'GitHub', Value: 'Actions' },
    { Key: 'Repository', Value: GITHUB_REPOSITORY },
    { Key: 'Workflow', Value: sanitizeGithubWorkflowName(GITHUB_WORKFLOW) },
    { Key: 'Action', Value: GITHUB_ACTION },
    { Key: 'Actor', Value: sanitizeGithubActor(GITHUB_ACTOR) },
    { Key: 'Commit', Value: GITHUB_SHA },
  ];
  if (isString(process.env.GITHUB_REF)) {
    tagArray.push({ Key: 'Branch', Value: process.env.GITHUB_REF });
  }

  const roleSessionTags = roleSkipSessionTagging ? undefined : tagArray;
  if (roleSessionTags === undefined) {
    core.debug('Role session tagging has been skipped.');
  } else {
    core.debug(roleSessionTags.length + ' role session tags are being used.');
  }

  const assumeRoleInput: AssumeRoleCommandInput = {
    RoleArn: roleArn,
    RoleSessionName: roleSessionName,
    DurationSeconds: roleDurationSeconds,
    Tags: roleSessionTags,
    ExternalId: roleExternalId,
  };
  Object.keys(assumeRoleInput).forEach(k =>
    assumeRoleInput[k as keyof AssumeRoleCommandInput] === undefined
      ? delete assumeRoleInput[k as keyof AssumeRoleCommandInput]
      : {}
  );

  // These are customizations needed for the GH OIDC Provider
  if (isString(webIdentityTokenFile) || isString(webIdentityToken)) {
    delete assumeRoleInput.Tags;
    delete assumeRoleInput.ExternalId;
    let assumeRoleWebInput: AssumeRoleWithWebIdentityCommandInput;
    if (isString(webIdentityToken)) {
      assumeRoleWebInput = {
        ...assumeRoleInput,
        WebIdentityToken: webIdentityToken,
      };
    } else {
      core.debug('webIdentityTokenFile provided. Will call AssumeRoleWithWebIdentity and take token from contents.');
      const webIdentityTokenFilePath = path.isAbsolute(webIdentityTokenFile!)
        ? webIdentityTokenFile!
        : path.join(GITHUB_WORKSPACE, webIdentityTokenFile!);

      if (!fs.existsSync(webIdentityTokenFilePath)) {
        throw new Error(`Web identity token file does not exist: ${webIdentityTokenFilePath}`);
      }

      try {
        assumeRoleWebInput = {
          ...assumeRoleInput,
          WebIdentityToken: fs.readFileSync(webIdentityTokenFilePath, 'utf8'),
        };
      } catch (error) {
        throw new Error(`Web identity token file could not be read: ${errorMessage(error)}`);
      }
    }

    const command = new AssumeRoleWithWebIdentityCommand(assumeRoleWebInput);
    return await retry(client.send(command), roleToAssumeRetries, roleToAssumeRetriesFactor);
  } else {
    const command = new AssumeRoleCommand(assumeRoleInput);
    return await retry(client.send(command), roleToAssumeRetries, roleToAssumeRetriesFactor);
  }
}
