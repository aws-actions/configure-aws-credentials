import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as core from '@actions/core';
import { type Credentials, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { ProxyAgent } from 'proxy-agent';
import { ProxyResolver } from './ProxyResolver';

const MAX_TAG_VALUE_LENGTH = 256;
const SANITIZATION_CHARACTER = '_';
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+/;
const DEFAULT_ROLE_DURATION = 3600; // One hour (seconds)
const ROLE_SESSION_NAME = 'GitHubActions';
const REGION_REGEX = /^[a-z0-9-]+$/g;

export function importEnvVariables() {
  const envVars = [
    'AWS_REGION',
    'ROLE_TO_ASSUME',
    'WEB_IDENTITY_TOKEN_FILE',
    'ROLE_CHAINING',
    'AUDIENCE',
    'HTTP_PROXY',
    'MASK_AWS_ACCOUNT_ID',
    'ROLE_DURATION_SECONDS',
    'ROLE_EXTERNAL_ID',
    'ROLE_SESSION_NAME',
    'ROLE_SKIP_SESSION_TAGGING',
    'INLINE_SESSION_POLICY',
    'MANAGED_SESSION_POLICIES',
    'OUTPUT_CREDENTIALS',
    'UNSET_CURRENT_CREDENTIALS',
    'DISABLE_RETRY',
    'RETRY_MAX_ATTEMPTS',
    'SPECIAL_CHARACTERS_WORKAROUND',
    'USE_EXISTING_CREDENTIALS',
    'NO_PROXY',
  ];
  // Treat HTTPS_PROXY as HTTP_PROXY. Precedence is HTTPS_PROXY > HTTP_PROXY
  if (process.env.HTTPS_PROXY) process.env.HTTP_PROXY = process.env.HTTPS_PROXY;

  for (const envVar of envVars) {
    if (process.env[envVar]) {
      const inputKey = `INPUT_${envVar.replace(/_/g, '-')}`;
      process.env[inputKey] = process.env[inputKey] || process.env[envVar];
    }
  }
}
export function getActionInputs() {
  const options = {
    AccessKeyId: getInput('aws-access-key-id'),
    SecretAccessKey: getInput('aws-secret-access-key'),
    SessionToken: getInput('aws-session-token'),
    region: getInput('aws-region', { required: true }) as string,
    roleToAssume: getInput('role-to-assume'),
    audience: getInput('audience'),
    maskAccountId: getBooleanInput('mask-aws-account-id'),
    roleExternalId: getInput('role-external-id'),
    webIdentityTokenFile: getInput('web-identity-token-file'),
    roleDuration: getNumberInput('role-duration-seconds', { default: DEFAULT_ROLE_DURATION }),
    roleSessionName: getInput('role-session-name', { default: ROLE_SESSION_NAME }),
    roleSkipSessionTagging: getBooleanInput('role-skip-session-tagging'),
    proxyServer: getInput('http-proxy', { default: process.env.HTTP_PROXY }),
    inlineSessionPolicy: getInput('inline-session-policy'),
    managedSessionPolicies: getMultilineInput('managed-session-policies')?.map((p) => ({ arn: p })),
    roleChaining: getBooleanInput('role-chaining'),
    outputCredentials: getBooleanInput('output-credentials'),
    unsetCurrentCredentials: getBooleanInput('unset-current-credentials'),
    exportEnvCredentials: getBooleanInput('output-env-credentials', { default: true }),
    disableRetry: getBooleanInput('disable-retry'),
    maxRetries: getNumberInput('retry-max-attempts', { default: 12 }) as number,
    specialCharacterWorkaround: getBooleanInput('special-characters-workaround'),
    useExistingCredentials: getBooleanInput('use-existing-credentials'),
    expectedAccountIds: getInput('allowed-account-ids')
      ?.split(',')
      .map((s) => s.trim()),
    forceSkipOidc: getBooleanInput('force-skip-oidc'),
    noProxy: getInput('no-proxy'),
    globalTimeout: getNumberInput('action-timeout-s', { default: 0 }) as number,
  } as const;
  // Checks
  if (options.forceSkipOidc && options.roleToAssume && !options.AccessKeyId && !options.webIdentityTokenFile) {
    throw new Error(
      "If 'force-skip-oidc' is true and 'role-to-assume' is set, 'aws-access-key-id' or 'web-identity-token-file' must be set",
    );
  }
  if (!options.roleToAssume && options.AccessKeyId && !options.SecretAccessKey) {
    throw new Error(
      "'aws-secret-access-key' must be provided if 'aws-access-key-id' is provided and not assuming a role",
    );
  }
  if (!options.region?.match(REGION_REGEX)) {
    throw new Error(`Region is not valid: ${options.region}`);
  }

  return options;
}

// Configure the AWS CLI and AWS SDKs using environment variables and set them as secrets.
// Setting the credentials as secrets masks them in Github Actions logs
export function exportCredentials(creds?: Partial<Credentials>) {
  if (creds?.AccessKeyId) {
    core.setSecret(creds.AccessKeyId);
    core.exportVariable('AWS_ACCESS_KEY_ID', creds.AccessKeyId);
  }

  if (creds?.SecretAccessKey) {
    core.setSecret(creds.SecretAccessKey);
    core.exportVariable('AWS_SECRET_ACCESS_KEY', creds.SecretAccessKey);
  }

  if (creds?.SessionToken) {
    core.setSecret(creds.SessionToken);
    core.exportVariable('AWS_SESSION_TOKEN', creds.SessionToken);
  } else if (process.env.AWS_SESSION_TOKEN) {
    // clear session token from previous credentials action
    core.exportVariable('AWS_SESSION_TOKEN', '');
  }
}

export function outputCredentials(creds?: Partial<Credentials>) {
  if (creds?.AccessKeyId) {
    core.setSecret(creds.AccessKeyId);
    core.setOutput('aws-access-key-id', creds.AccessKeyId);
  }
  if (creds?.SecretAccessKey) {
    core.setSecret(creds.SecretAccessKey);
    core.setOutput('aws-secret-access-key', creds.SecretAccessKey);
  }
  if (creds?.SessionToken) {
    core.setSecret(creds.SessionToken);
    core.setOutput('aws-session-token', creds.SessionToken);
  }
  if (creds?.Expiration) {
    core.setOutput('aws-expiration', creds.Expiration);
  }
}

export function unsetCredentials(outputEnvCredentials?: boolean) {
  if (outputEnvCredentials) {
    core.exportVariable('AWS_ACCESS_KEY_ID', '');
    core.exportVariable('AWS_SECRET_ACCESS_KEY', '');
    core.exportVariable('AWS_SESSION_TOKEN', '');
    core.exportVariable('AWS_REGION', '');
    core.exportVariable('AWS_DEFAULT_REGION', '');
  }
}

export function exportRegion(region: string) {
  core.exportVariable('AWS_DEFAULT_REGION', region);
  core.exportVariable('AWS_REGION', region);
}

export function outputRegion(region: string) {
  core.setOutput('aws-region', region);
  core.setOutput('aws-default-region', region);
}

async function getCallerIdentity(client: STSClient): Promise<{ Account: string; Arn: string; UserId?: string }> {
  const identity = await client.send(new GetCallerIdentityCommand({}));
  if (!identity.Account || !identity.Arn) {
    throw new Error('Could not get Account ID or ARN from STS. Did you set credentials?');
  }
  const result: { Account: string; Arn: string; UserId?: string } = {
    Account: identity.Account,
    Arn: identity.Arn,
  };
  if (identity.UserId !== undefined) {
    result.UserId = identity.UserId;
  }
  return result;
}

export function outputAccountId(accountId: string, opts: { arn?: string | undefined; maskAccountId?: boolean }) {
  if (opts.maskAccountId) {
    core.setSecret(accountId);
    if (opts.arn) core.setSecret(opts.arn);
  }
  core.setOutput('aws-account-id', accountId);
  core.setOutput('authenticated-arn', opts.arn);
}

export function exportAccountId(accountId: string, opts: { maskAccountId?: boolean }) {
  if (opts.maskAccountId) {
    core.setSecret(accountId);
  }
  core.exportVariable('AWS_ACCOUNT_ID', accountId);
}

// Obtains account ID and AssumedRole ARN from STS
export async function getAccountIdFromCredentials(
  credentials: AwsCredentialIdentity,
  args?: { requestHandler?: NodeHttpHandler; region?: string },
): Promise<{ Account: string; Arn?: string | undefined } | undefined> {
  const requestHandler = args?.requestHandler;
  const region = args?.region;
  const client = new STSClient({ credentials, ...(requestHandler && { requestHandler }), ...(region && { region }) });
  try {
    const result = await getCallerIdentity(client);
    return { Account: result.Account, Arn: result.Arn };
  } catch (error) {
    core.debug(`getAccountIdFromCredentials: ${errorMessage(error)}`);
    return undefined;
  }
}

// Tags have a more restrictive set of acceptable characters than GitHub environment variables can.
// This replaces anything not conforming to the tag restrictions by inverting the regular expression.
// See the AWS documentation for constraint specifics https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html.
export function sanitizeGitHubVariables(name: string) {
  const nameWithoutSpecialCharacters = name.replace(/[^\p{L}\p{Z}\p{N}_.:/=+\-@]/gu, SANITIZATION_CHARACTER);
  const nameTruncated = nameWithoutSpecialCharacters.slice(0, MAX_TAG_VALUE_LENGTH);
  return nameTruncated;
}

export function verifyKeys(creds: { AccessKeyId?: string; SecretAccessKey?: string } | undefined) {
  if (!creds) {
    return false;
  }
  if (creds.AccessKeyId) {
    if (SPECIAL_CHARS_REGEX.test(creds.AccessKeyId)) {
      core.debug('AccessKeyId contains special characters.');
      return false;
    }
  }
  if (creds.SecretAccessKey) {
    if (SPECIAL_CHARS_REGEX.test(creds.SecretAccessKey)) {
      core.debug('SecretAccessKey contains special characters.');
      return false;
    }
  }
  return true;
}

// Retries the promise with exponential backoff if the error isRetryable up to maxRetries time.
export async function retryAndBackoff<T>(
  fn: () => Promise<T>,
  isRetryable: boolean,
  maxRetries = 12,
  retries = 0,
  base = 50,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRetryable) {
      core.debug(`retryAndBackoff: error is not retryable: ${errorMessage(err)}`);
      throw err;
    }
    // It's retryable, so sleep and retry.
    const delay = Math.random() * (2 ** retries * base);
    const nextRetry = retries + 1;

    core.debug(
      `retryAndBackoff: attempt ${nextRetry} of ${maxRetries} failed: ${errorMessage(err)}. ` +
        `Retrying after ${Math.floor(delay)}ms.`,
    );

    await new Promise((r) => setTimeout(r, delay));

    if (nextRetry >= maxRetries) {
      core.debug('retryAndBackoff: reached max retries; giving up.');
      throw err;
    }

    return await retryAndBackoff(fn, isRetryable, maxRetries, nextRetry, base);
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

// Note: requires that credentials are already resolvable with the default chain.
export async function areCredentialsValid(args: { requestHandler?: NodeHttpHandler; region?: string }) {
  // GetCallerIdentity does not require any permissions
  const requestHandler = args.requestHandler;
  const region = args.region;
  const client = new STSClient({ ...(requestHandler && { requestHandler }), ...(region && { region }) });
  try {
    const identity = await getCallerIdentity(client);
    if (identity.Account) {
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

export function configureProxy(proxyServer?: string, noProxy?: string): NodeHttpHandler {
  if (proxyServer) {
    core.info('Configuring proxy handler');
    const proxyOptions: { httpProxy: string; httpsProxy: string; noProxy?: string } = {
      httpProxy: proxyServer,
      httpsProxy: proxyServer,
      ...(noProxy && { noProxy }),
    };
    const getProxyForUrl = new ProxyResolver(proxyOptions).getProxyForUrl;
    const handler = new ProxyAgent({ getProxyForUrl });
    return new NodeHttpHandler({ httpsAgent: handler, httpAgent: handler });
  }
  return new NodeHttpHandler();
}

/**
 * Like core.getBooleanInput, but respects the required option.
 *
 * From https://github.com/actions/toolkit/blob/6876e2a664ec02908178087905b9155e9892a437/packages/core/src/core.ts
 *
 * Gets the input value of the boolean type in the YAML 1.2 "core schema" specification.
 * Support boolean input list: `true | True | TRUE | false | False | FALSE` .
 * The return value is also in boolean type.
 * ref: https://yaml.org/spec/1.2/spec.html#id2804923
 *
 * @param     name     name of the input to get
 * @param     options  optional. See core.InputOptions. Also supports optional 'default' if the input is not set
 * @returns   boolean
 */
export function getBooleanInput(name: string, options?: core.InputOptions & { default?: boolean }): boolean {
  const trueValue = ['true', 'True', 'TRUE'];
  const falseValue = ['false', 'False', 'FALSE'];
  const optionsWithoutDefault = { ...options };
  delete optionsWithoutDefault.default;
  const val = core.getInput(name, optionsWithoutDefault);
  if (trueValue.includes(val)) return true;
  if (falseValue.includes(val)) return false;
  if (val === '') return options?.default ?? false;
  throw new TypeError(
    `Input does not meet YAML 1.2 "Core Schema" specification: ${name}\n` +
      `Support boolean input list: \`true | True | TRUE | false | False | FALSE\``,
  );
}

// As above, but for other input types
export function getInput(
  name: string,
  options?: core.InputOptions & { default?: string | undefined },
): string | undefined {
  const input = core.getInput(name, options);
  if (input === '') return options?.default;
  return input;
}
export function getNumberInput(
  name: string,
  options?: core.InputOptions & { default?: number | undefined },
): number | undefined {
  const input = core.getInput(name, options);
  if (input === '') return options?.default;
  // biome-ignore lint/correctness/useParseIntRadix: intentionally support 0x
  return Number.parseInt(input);
}
export function getMultilineInput(name: string, options?: core.InputOptions): string[] | undefined {
  const input = getInput(name, options)
    ?.split('\n')
    .filter((i) => i !== '');
  if (options?.trimWhitespace === false) return input;
  return input?.map((i) => i.trim());
}

export function useGitHubOIDCProvider(options: ReturnType<typeof getActionInputs>): boolean {
  if (options.forceSkipOidc) return false;
  if (
    !!options.roleToAssume &&
    !options.webIdentityTokenFile &&
    !options.AccessKeyId &&
    !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN &&
    !options.roleChaining
  ) {
    core.info(
      'It looks like you might be trying to authenticate with OIDC. Did you mean to set the `id-token` permission? ' +
        'If you are not trying to authenticate with OIDC and the action is working successfully, you can ignore this message.',
    );
  }
  return (
    !!options.roleToAssume &&
    !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN &&
    !options.AccessKeyId &&
    !options.webIdentityTokenFile &&
    !options.roleChaining
  );
}

export async function getGHToken(options: ReturnType<typeof getActionInputs>): Promise<string> {
  let webIdentityToken: string;
  try {
    webIdentityToken = await retryAndBackoff(
      async () => core.getIDToken(options.audience),
      !options.disableRetry,
      options.maxRetries,
    );
  } catch (error) {
    throw new Error(`getIDToken call failed: ${errorMessage(error)}`);
  }
  return webIdentityToken;
}

export async function getFileToken(options: ReturnType<typeof getActionInputs>): Promise<string> {
  if (!options.webIdentityTokenFile) throw new Error('webIdentityTokenFile not provided');
  core.debug(
    'webIdentityTokenFile provided. Will call sts:AssumeRoleWithWebIdentity and take session tags from token contents.',
  );
  const workspace = process.env.GITHUB_WORKSPACE ?? '';
  const webIdentityTokenFilePath = path.isAbsolute(options.webIdentityTokenFile)
    ? options.webIdentityTokenFile
    : path.join(workspace, options.webIdentityTokenFile);
  if (!existsSync(webIdentityTokenFilePath)) {
    throw new Error(`webIdentityTokenFile does not exist: ${webIdentityTokenFilePath}`);
  }
  core.info('Assuming role with web identity token file');
  try {
    const webIdentityToken = readFileSync(webIdentityTokenFilePath, 'utf8');
    return webIdentityToken;
  } catch (error) {
    throw new Error(`Could not read web identity token file: ${errorMessage(error)}`);
  }
}
