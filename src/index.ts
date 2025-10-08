import * as core from '@actions/core';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import { CredentialsClient, type CredentialsClientProps } from './CredentialsClient';
import {
  areCredentialsValid,
  configureProxy,
  errorMessage,
  exportAccountId,
  exportCredentials,
  exportRegion,
  getAccountIdFromCredentials,
  getActionInputs,
  getFileToken,
  getGHToken,
  importEnvVariables,
  outputAccountId,
  outputCredentials,
  outputRegion,
  retryAndBackoff,
  useGitHubOIDCProvider,
  verifyKeys,
} from './helpers';

export async function run(): Promise<void> {
  try {
    // Set up inputs
    importEnvVariables();
    const options = getActionInputs();
    let maxRetries = options.maxRetries;
    let disableRetry = options.disableRetry;

    // Set up retry handler
    if (maxRetries < 1) maxRetries = 1;
    if (options.specialCharacterWorkaround) {
      disableRetry = false;
      if (maxRetries <= 1) maxRetries = 12;
    }

    // Set up global timeout
    let timeoutId: NodeJS.Timeout | undefined;
    if (options.globalTimeout > 0) {
      core.info(`Setting a global timeout of ${options.globalTimeout} seconds for the action`);
      timeoutId = setTimeout(() => {
        core.setFailed(`Action timed out after ${options.globalTimeout} seconds`);
        process.exit(1);
      }, options.globalTimeout * 1000);
    }

    // Set up proxy.
    const requestHandler = configureProxy(options.proxyServer, options.noProxy);

    // if the user wants to attempt to use existing credentials, check if we have some already.
    // Requires STS. Uses default credential provider resolution chain.
    if (options.useExistingCredentials) {
      if (await areCredentialsValid({ requestHandler, region: options.region })) {
        core.notice('Pre-existing credentials are valid. No need to generate new ones.');
        if (timeoutId) clearTimeout(timeoutId);
        return;
      }
      core.notice('No valid credentials exist. Running as normal.');
    }

    // Set which flow to use
    // Refer to README.md for which flow to use based on set inputs
    const shouldUseGHOIDC = useGitHubOIDCProvider(options); // Checks for id-token permission
    const shouldUseTokenFile = !!options.webIdentityTokenFile;

    let clientProps: CredentialsClientProps;
    if (options.roleToAssume) {
      const assumeRoleProps = {
        roleArn: options.roleToAssume,
        ...(options.roleSessionName && { roleSessionName: options.roleSessionName }),
        ...(options.roleDuration && { durationSeconds: options.roleDuration }),
        region: options.region,
        requestHandler,
        ...(options.inlineSessionPolicy && { policy: options.inlineSessionPolicy }),
        ...(options.managedSessionPolicies && { policyArns: options.managedSessionPolicies }),
      };
      if (shouldUseGHOIDC || shouldUseTokenFile) {
        const token = shouldUseGHOIDC ? await getGHToken(options) : await getFileToken(options);
        clientProps = { mode: 'web-identity', webIdentityToken: token, ...assumeRoleProps };
      } else {
        clientProps = { mode: 'sts', ...assumeRoleProps };
      }
    } else {
      // TODO: falling back to env only is a breaking change. Decide if fallback to the default
      // chain is better.
      clientProps = { mode: 'env' };
      disableRetry = true; // Retrying the environment credentials is invalid
    }
    // TODO: add mode 'instance-metadata' and 'container-metadata' here

    // Get the credentials
    const fetchCredentials = new CredentialsClient(clientProps).getCredentials();
    let credentials: AwsCredentialIdentity;
    do {
      credentials = await retryAndBackoff(async () => await fetchCredentials(), !disableRetry, maxRetries);
    } while (
      options.specialCharacterWorkaround &&
      !verifyKeys({ AccessKeyId: credentials.accessKeyId, SecretAccessKey: credentials.secretAccessKey })
    );

    // Not all credential sources have a account ID attached, so this may require another STS call
    const accountId = await getAccountIdFromCredentials(credentials, { region: options.region, requestHandler });
    if (options.expectedAccountIds) {
      if (!options.expectedAccountIds.includes(accountId?.Account ?? '')) {
        throw new Error(`Account ID ${accountId?.Account} is not in the list of expected account IDs`);
      }
    }

    // Export the credentials
    // Note: output refers to action outputs, export refers to process.env
    if (options.exportEnvCredentials) {
      exportCredentials({
        AccessKeyId: credentials.accessKeyId,
        SecretAccessKey: credentials.secretAccessKey,
        Expiration: credentials.expiration,
        SessionToken: credentials.sessionToken,
      });
      exportRegion(options.region);
      if (accountId) exportAccountId(accountId.Account, { maskAccountId: options.maskAccountId });
    }
    if (options.outputCredentials) {
      outputCredentials({
        AccessKeyId: credentials.accessKeyId,
        SecretAccessKey: credentials.secretAccessKey,
        Expiration: credentials.expiration,
        SessionToken: credentials.sessionToken,
      });
      outputRegion(options.region);
      if (accountId) {
        outputAccountId(accountId.Account, { arn: accountId.Arn, maskAccountId: options.maskAccountId });
      }
    }

    // Clear global timeout
    if (timeoutId) clearTimeout(timeoutId);
  } catch (error) {
    core.setFailed(errorMessage(error));
    if (process.env.SHOW_STACK_TRACE) throw error;
  }
}

if (require.main === module) {
  (async () => {
    await run();
  })().catch((e) => {
    core.setFailed(errorMessage(e));
  });
}
