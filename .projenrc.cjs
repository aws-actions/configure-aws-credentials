const { JsonPatch } = require('projen');
const { GitHubActionTypeScriptProject, RunsUsing } = require('projen-github-action-typescript');
const { DependabotScheduleInterval } = require('projen/lib/github');
const { NodePackageManager, NpmAccess } = require('projen/lib/javascript');

const project = new GitHubActionTypeScriptProject({
  defaultReleaseBranch: 'main',
  devDeps: ['projen-github-action-typescript', '@aws-sdk/credential-provider-env', 'aws-sdk-client-mock', '@jest/globals'],
  deps: ['@aws-sdk/client-sts@^3'],
  name: 'configure-aws-credentials',
  description: 'A GitHub Action to configure AWS credentials',
  keywords: ['aws', 'github', 'github-action'],
  repositoryUrl: 'git+https://github.com/aws-actions/configure-aws-credentials.git',
  authorName: 'Amazon.com, Inc. or its affiliates',
  authorOrganization: true,
  authorUrl: 'https://aws.amazon.com',
  packageManager: NodePackageManager.NPM,
  projenrcJsOptions: {
    filename: '.projenrc.cjs',
  },
  sampleCode: false,
  actionMetadata: {
    name: '"Configure AWS Credentials" Action for GitHub Actions',
    description: 'Configures AWS credentials for use in subsequent steps in a GitHub Action workflow',
    runs: {
      using: RunsUsing.NODE_16,
      main: 'dist/index.js',
      post: 'dist/cleanup/index.js',
    },
    branding: {
      color: 'orange',
      icon: 'cloud',
    },
    inputs: {
      audience: {
        description: 'The audience to use for the OIDC provider',
        required: false,
        default: 'sts.amazonaws.com',
      },
      'aws-access-key-id': {
        description:
          'AWS Access Key ID. This input is required if running in the GitHub hosted environment. It is optional if ' +
          'running in a self-hosted environment that already has AWS credentials, for example on an EC2 instance.',
        required: false,
      },
      'aws-secret-access-key': {
        description:
          'AWS Access Key ID. This input is required if running in the GitHub hosted environment. It is optional if ' +
          'running in a self-hosted environment that already has AWS credentials, for example on an EC2 instance.',
        required: false,
      },
      'aws-session-token': {
        description: 'AWS Session Token',
        required: false,
      },
      'aws-region': {
        description: 'AWS Region, e.g. us-east-2',
        required: true,
      },
      'mask-aws-account-id': {
        description:
          'Whether to mask the AWS account ID for these credentials as a secret value, so that it is masked in logs. ' +
          'Valid values are "true" or "false". Defaults to "true".',
        required: false,
      },
      'role-to-assume': {
        description:
          'The Amazon Resource Name (ARN) of the role to assume. Use the provided credentials to assume an IAM role ' +
          'and configure the Actions environment with the assumed role credentials rather than with the provided ' +
          'credentials.',
        required: false,
      },
      'web-identity-token-file': {
        description:
          'Use the web identity token file from the provided file system path in order to assume an IAM role using a ' +
          'web identity, e.g. from within an Amazon EKS worker node.',
        required: false,
      },
      'role-duration-seconds': {
        description: 'Role duration in seconds (default: 6 hours, 1 hour for OIDC/specified aws-session-token)',
        required: false,
      },
      'role-session-name': {
        description: 'Role session name (default: GitHubActions)',
        required: false,
      },
      'role-external-id': {
        description: 'The external ID of the role to assume',
        required: false,
      },
      'role-skip-session-tagging': {
        description: 'Skip session tagging during role assumption',
        required: false,
      },
    },
    outputs: {
      'aws-account-id': {
        description: 'The AWS account ID for the provided credentials',
      },
    },
  },
  majorVersion: 2,
  // minNodeVersion is not the same as the node version used by the action
  minNodeVersion: '14.0.0',
  bugsUrl: 'https://github.com/aws-actions/configure-aws-credentials/issues',
  releaseToNpm: false,
  copyrightOwner: 'Amazon.com, Inc. or its affiliates',
  copyrightPeriod: '2019-2022',
  license: 'MIT',
  homepage: 'https://github.com/aws-actions/configure-aws-credentials',
  eslintOptions: {
    yaml: true,
    prettier: true,
  },
  releaseFailureIssue: true,
  releaseTagPrefix: 'v',
  codeCov: false,
  libdir: 'build',
  entrypoint: 'build/index.js',
  npmignoreEnabled: false,
  tsconfig: {
    compilerOptions: {
      declaration: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      esModuleInterop: true,
      noEmitOnError: true,
      noFallthroughCasesInSwitch: true,
      noImplicitReturns: true,
      inlineSourceMap: true,
      strict: true,
      // Node 16 is ES2022
      target: 'ES2022',
      outDir: 'build',
    },
  },
  prettier: true,
  prettierOptions: {
    ignoreFile: false,
    settings: {
      printWidth: 120,
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      bracketSpacing: true,
    },
  },
  dependabot: true,
  dependabotOptions: {
    scheduleInterval: DependabotScheduleInterval.WEEKLY,

  },
  githubOptions: {
    mergify: true,
    mergifyOptions: {
      queues: [{ name: 'default', conditions: ['status-success=Run Unit Tests', '-label~=(do-not-merge)'] }],
      rules: [
        {
          name: 'Automatically merge on CI success and review approval',
          conditions: [
            'base~=master|integ-tests|main',
            '"#approved-reviews-by>=1"',
            '-approved-reviews-by~=author',
            'status-success=Run Unit Tests',
            'label!=work-in-progress',
            '-title~=(WIP|wip)',
            '-merged',
            '-closed',
            'author!=dependabot[bot]',
          ],
          actions: {
            queue: { name: 'main', method: 'squash' },
          },
        },
        {
          name: 'Automatically approve and merge Dependabot PRs',
          conditions: [
            'base~=master|main',
            'author=dependabot[bot]',
            'status-success=build',
            '-title~=(WIP|wip)',
            '-label~=(do-not-merge|blocked)',
            '-merged',
            '-closed',
          ],
          actions: {
            review: { type: 'APPROVE' },
            queue: { name: 'main', method: 'squash' },
          },
        },
      ],
    },
  },
});
/*-------------------------------------------------------------------
   Overrides and escape hatches
-------------------------------------------------------------------*/
// We use different mergify defaults than projen
const mergifyyml = project.tryFindObjectFile('.mergify.yml');
if (mergifyyml) {
  const mergifyQueues = mergifyyml.obj.queue_rules.pop();
  const mergifyRules = mergifyyml.obj.pull_request_rules.pop();
  mergifyyml.addOverride('queue_rules', mergifyQueues);
  mergifyyml.addOverride('pull_request_rules', mergifyRules);
}
// Misc tsconfig overrides
const tsconfig = project.tryFindObjectFile('tsconfig.json');
if (tsconfig) {
  tsconfig.addOverride('compilerOptions.allowUnreachableCode', false);
  tsconfig.addOverride('compilerOptions.allowUnusedLabels', false);
  tsconfig.addOverride('compilerOptions.pretty', true);
}
// The default jest config does not have the correct path
project.jest?.addTestMatch('<rootDir>/test/**/*.(test|spec).(js|jsx|ts|tsx)');
// Future-proofing in case we decide to move to ESM
project.setScript('projen', 'node .projenrc.cjs');
// Most jest overrides. Specifically, work around the deprecation of the jest globals config
const packageJson = project.tryFindFile('package.json');
if (packageJson) {
  packageJson.addOverride('jest.transform', {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.dev.json',
      },
    ],
  });
  packageJson.addOverride('jest.globals', undefined);
  // The entrypoint property is supposed to manage this but it doesn't work
  packageJson.addOverride('main', 'build/index.js');
  // We don't want to publish this to NPM.
  packageJson.addOverride('private', true);
}
// Projen doesn't know about our extra branches
const dependabotConfig = project.tryFindObjectFile('.github/dependabot.yml');
if (dependabotConfig) {
  dependabotConfig.patch(JsonPatch.add('/updates/0/open-pull-requests-limit', 10));
  dependabotConfig.patch(JsonPatch.add('/updates/0/target-branch', 'main'));
  dependabotConfig.patch(JsonPatch.add('/updates/0/schedule/day', 'tuesday'));
  dependabotConfig.addToArray('updates', {
    'package-ecosystem': 'npm',
    directory: '/',
    'open-pull-requests-limit': 10,
    'target-branch': 'v1-node16',
    ignore: [ { 'dependency-name': 'projen' } ],
    'versioning-strategy': 'lockfile-only',
    schedule: { interval: 'weekly', day: 'tuesday' },
  });
}

project.synth();
