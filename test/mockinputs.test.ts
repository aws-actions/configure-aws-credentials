import type * as core from '@actions/core';

const inputs = {
  GH_OIDC_INPUTS: {
    'role-to-assume': 'arn:aws:iam::111111111111:role/MY-ROLE',
    'aws-region': 'fake-region-1',
    'special-characters-workaround': 'true',
  },
  CUSTOM_TAGS_JSON_INPUTS: {
    'aws-access-key-id': 'MYAWSACCESSKEYID',
    'aws-secret-access-key': 'MYAWSSECRETACCESSKEY',
    'role-to-assume': 'arn:aws:iam::111111111111:role/MY-ROLE',
    'aws-region': 'fake-region-1',
    'custom-tags': '{"Environment": "Production", "Team": "DevOps"}',
  },
  CUSTOM_TAGS_INVALID_JSON_INPUTS: {
    'aws-access-key-id': 'MYAWSACCESSKEYID',
    'aws-secret-access-key': 'MYAWSSECRETACCESSKEY',
    'role-to-assume': 'arn:aws:iam::111111111111:role/MY-ROLE',
    'aws-region': 'fake-region-1',
    'retry-max-attempts': '1',
    'custom-tags': 'not a json',
  },
  CUSTOM_TAGS_OBJECT_INPUTS: {
    'aws-access-key-id': 'MYAWSACCESSKEYID',
    'aws-secret-access-key': 'MYAWSSECRETACCESSKEY',
    'role-to-assume': 'arn:aws:iam::111111111111:role/MY-ROLE',
    'aws-region': 'fake-region-1',
    'retry-max-attempts': '1',
    'custom-tags': JSON.stringify({ Environment: 'Production', Team: 'DevOps' }),
  },
  IAM_USER_INPUTS: {
    'aws-access-key-id': 'MYAWSACCESSKEYID',
    'aws-secret-access-key': 'MYAWSSECRETACCESSKEY',
    'aws-region': 'fake-region-1',
  },
  IAM_ASSUMEROLE_INPUTS: {
    'aws-access-key-id': 'MYAWSACCESSKEYID',
    'aws-secret-access-key': 'MYAWSSECRETACCESSKEY',
    'role-to-assume': 'arn:aws:iam::111111111111:role/MY-ROLE',
    'aws-region': 'fake-region-1',
  },
  WEBIDENTITY_TOKEN_FILE_INPUTS: {
    'web-identity-token-file': 'file.txt',
    'role-to-assume': 'arn:aws:iam::111111111111:role/MY-ROLE',
    'aws-region': 'fake-region-1',
  },
  EXISTING_ROLE_INPUTS: {
    'role-to-assume': 'arn:aws:iam::111111111111:role/MY-ROLE',
    'role-chaining': 'true',
    'aws-region': 'fake-region-1',
  },
  USE_EXISTING_CREDENTIALS_INPUTS: {
    'aws-region': 'fake-region-1',
    'use-existing-credentials': 'true',
    'role-to-assume': 'arn:aws:iam::111111111111:role/MY-ROLE',
  }
};

const envs = {
  GITHUB_REPOSITORY: 'MY-REPOSITORY-NAME',
  GITHUB_WORKFLOW: 'MY-WORKFLOW-ID',
  GITHUB_ACTION: 'MY-ACTION-NAME',
  GITHUB_ACTOR: 'MY-USERNAME[bot]',
  GITHUB_SHA: 'MY-COMMIT-ID',
  GITHUB_WORKSPACE: '/home/github',
  GITHUB_ACTIONS: 'true',
};

const outputs = {
  STS_CREDENTIALS: {
    Credentials: {
      AccessKeyId: 'STSAWSACCESSKEYID',
      SecretAccessKey: 'STSAWSSECRETACCESSKEY',
      SessionToken: 'STSAWSSESSIONTOKEN',
      Expiration: new Date(8640000000000000),
    },
    AssumedRoleUser: {
      Arn: 'arn:aws:sts::111111111111:assumed-role/MY-ROLE/',
      AssumedRoleId: 'AROAFAKEASSUMEDROLEID',
    },
  },
  GET_CALLER_IDENTITY: {
    Account: '111111111111',
    Arn: 'arn:aws:iam::111111111111:role/MY-ROLE',
  },
  FAKE_STS_ACCESS_KEY_ID: 'STSAWSACCESSKEYID',
  FAKE_STS_SECRET_ACCESS_KEY: 'STSAWSSECRETACCESSKEY',
  FAKE_STS_SESSION_TOKEN: 'STSAWSSESSIONTOKEN',
  ODD_CHARACTER_CREDENTIALS: {
    Credentials: {
      AccessKeyId: 'STSA#$%^&',
      SecretAccessKey: 'STSA#$%^&Key',
      SessionToken: 'STSA#$%^',
      Expiration: new Date(8640000000000000),
    },
    AssumedRoleUser: {
      Arn: 'arn:aws:sts::111111111111:assumed-role/MY-ROLE/',
      AssumedRoleId: 'AROAFAKEASSUMEDROLEID',
    },
  },
};

export default {
  getInput: (fakeEnv: Record<string, string>) => {
    return (name: string, options?: core.InputOptions): string => {
      if (!fakeEnv[name]) {
        if (options?.required) throw new Error(`Input ${name} not found`);
        return '';
      }
      return fakeEnv[name];
    };
  },
  getMultilineInput: (fakeEnv: Record<string, string[]>) => {
    return (name: string, options?: core.InputOptions): string[] => {
      if (!fakeEnv[name]) {
        if (options?.required) throw new Error(`Input ${name} not found`);
        return [];
      }
      return fakeEnv[name];
    };
  },
  ...inputs,
  outputs,
  envs,
} as const;
