import assert from 'assert';
import fs from 'fs';
import path from 'path';
import * as core from '@actions/core';
import type { AssumeRoleCommandInput, Tag } from '@aws-sdk/client-sts';
import { AssumeRoleCommand, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts';
import { errorMessage, getStsClient, isDefined, sanitizeGithubActor, sanitizeGithubWorkflowName } from './helpers';

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

  const tagArray: Tag[] = [
    { Key: 'GitHub', Value: 'Actions' },
    { Key: 'Repository', Value: GITHUB_REPOSITORY },
    { Key: 'Workflow', Value: sanitizeGithubWorkflowName(GITHUB_WORKFLOW) },
    { Key: 'Action', Value: GITHUB_ACTION },
    { Key: 'Actor', Value: sanitizeGithubActor(GITHUB_ACTOR) },
    { Key: 'Commit', Value: GITHUB_SHA },
  ];

  if (process.env['GITHUB_REF']) {
    tagArray.push({ Key: 'Branch', Value: process.env['GITHUB_REF'] });
  }

  const Tags = roleSkipSessionTagging ? undefined : tagArray;
  if (!Tags) {
    core.debug('Role session tagging has been skipped.');
  } else {
    core.debug(`${Tags.length} role session tags are being used.`);
  }

  const ExternalId = roleExternalId;

  const commonAssumeRoleParams: AssumeRoleCommandInput = {
    RoleArn,
    RoleSessionName: roleSessionName,
    DurationSeconds: roleDurationSeconds,
    ...(Tags ? { Tags } : {}),
    ...(ExternalId ? { ExternalId } : {}),
  };
  const keys = Object.keys(commonAssumeRoleParams) as Array<keyof typeof commonAssumeRoleParams>;
  keys.forEach((k) => commonAssumeRoleParams[k] === undefined && delete commonAssumeRoleParams[k]);

  const sts = getStsClient(region);
  switch (true) {
    case !!webIdentityToken: {
      delete commonAssumeRoleParams.Tags;
      return sts.send(
        new AssumeRoleWithWebIdentityCommand({
          ...commonAssumeRoleParams,
          WebIdentityToken: webIdentityToken,
        })
      );
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
        const widt = fs.readFileSync(webIdentityTokenFilePath, 'utf8');
        delete commonAssumeRoleParams.Tags;
        return await sts.send(
          new AssumeRoleWithWebIdentityCommand({
            ...commonAssumeRoleParams,
            WebIdentityToken: widt,
          })
        );
      } catch (error) {
        throw new Error(`Web identity token file could not be read: ${errorMessage(error)}`);
      }
    }
    default: {
      return sts.send(new AssumeRoleCommand({ ...commonAssumeRoleParams }));
    }
  }
}
