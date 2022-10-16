"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const client_sts_1 = require("@aws-sdk/client-sts");
const assumeRole_1 = require("./assumeRole");
const helpers_1 = require("./helpers");
// Use 1hr as role duration when using session token or OIDC
// Otherwise, use the max duration of GitHub action (6hr)
const MAX_ACTION_RUNTIME = 6 * 3600;
const SESSION_ROLE_DURATION = 3600;
const DEFAULT_ROLE_DURATION_FOR_OIDC_ROLES = 3600;
const USER_AGENT = 'configure-aws-credentials-for-github-actions';
const ROLE_SESSION_NAME = 'GitHubActions';
const REGION_REGEX = /^[a-z0-9-]+$/g;
function exportCredentials(creds) {
    // Configure the AWS CLI and AWS SDKs using environment variables and set them as secrets.
    // Setting the credentials as secrets masks them in Github Actions logs
    // AWS_ACCESS_KEY_ID:
    // Specifies an AWS access key associated with an IAM user or role
    if (creds?.AccessKeyId) {
        core.setSecret(creds.AccessKeyId);
        core.exportVariable('AWS_ACCESS_KEY_ID', creds.AccessKeyId);
    }
    // AWS_SECRET_ACCESS_KEY:
    // Specifies the secret key associated with the access key. This is essentially the "password" for the access key.
    if (creds?.SecretAccessKey) {
        core.setSecret(creds.SecretAccessKey);
        core.exportVariable('AWS_SECRET_ACCESS_KEY', creds.SecretAccessKey);
    }
    // AWS_SESSION_TOKEN:
    // Specifies the session token value that is required if you are using temporary security credentials.
    if (creds?.SessionToken) {
        core.setSecret(creds.SessionToken);
        core.exportVariable('AWS_SESSION_TOKEN', creds.SessionToken);
    }
    else if (process.env.AWS_SESSION_TOKEN) {
        // clear session token from previous credentials action
        core.exportVariable('AWS_SESSION_TOKEN', '');
    }
}
function exportRegion(region) {
    // AWS_DEFAULT_REGION and AWS_REGION:
    // Specifies the AWS Region to send requests to
    core.exportVariable('AWS_DEFAULT_REGION', region);
    core.exportVariable('AWS_REGION', region);
}
async function exportAccountId(region, maskAccountId) {
    // Get the AWS account ID
    const client = (0, helpers_1.getStsClient)(region, USER_AGENT);
    const identity = (await client.send(new client_sts_1.GetCallerIdentityCommand({}))).Account;
    if (!identity) {
        throw new Error('Could not get Account ID from STS. Did you set credentials?');
    }
    if (maskAccountId) {
        core.setSecret(identity);
    }
    else {
        core.setOutput('aws-account-id', identity);
    }
    return identity;
}
function loadCredentials() {
    // Previously, this function forced the SDK to re-resolve credentials with the default provider chain.
    //
    // This action typically sets credentials in the environment via environment variables. The SDK never refreshed those
    // env-var-based credentials after initial load. In case there were already env-var creds set in the actions
    // environment when this action loaded, this action needed to refresh the SDK creds after overwriting those
    // environment variables.
    //
    // However, in V3 of the JavaScript SDK, there is no longer a global configuration object: all configuration,
    // including credentials, are instantiated per client and not merged back into global state.
    const client = new client_sts_1.STSClient({});
    return client.config.credentials();
}
async function validateCredentials(expectedAccessKeyId) {
    let credentials;
    try {
        credentials = await loadCredentials();
        if (!credentials.accessKeyId) {
            throw new Error('Access key ID empty after loading credentials');
        }
    }
    catch (error) {
        throw new Error(`Credentials could not be loaded, please check your action inputs: ${(0, helpers_1.errorMessage)(error)}`);
    }
    const actualAccessKeyId = credentials.accessKeyId;
    if (expectedAccessKeyId && expectedAccessKeyId !== actualAccessKeyId) {
        throw new Error('Unexpected failure: Credentials loaded by the SDK do not match the access key ID configured by the action');
    }
}
async function run() {
    try {
        // Get inputs
        const AccessKeyId = core.getInput('aws-access-key-id', { required: false });
        const audience = core.getInput('audience', { required: false });
        const SecretAccessKey = core.getInput('aws-secret-access-key', { required: false });
        const region = core.getInput('aws-region', { required: true });
        const SessionToken = core.getInput('aws-session-token', { required: false });
        const maskAccountId = (core.getInput('mask-aws-account-id', { required: false }) || 'true').toLowerCase() === 'true';
        const roleToAssume = core.getInput('role-to-assume', { required: false });
        const roleExternalId = core.getInput('role-external-id', { required: false });
        const roleSessionName = core.getInput('role-session-name', { required: false }) || ROLE_SESSION_NAME;
        const roleSkipSessionTaggingInput = core.getInput('role-skip-session-tagging', { required: false }) || 'false';
        const roleSkipSessionTagging = roleSkipSessionTaggingInput.toLowerCase() === 'true';
        const webIdentityTokenFile = core.getInput('web-identity-token-file', { required: false });
        // This wraps the logic for deciding if we should rely on the GH OIDC provider since we may need to reference
        // the decision in a few differennt places. Consolidating it here makes the logic clearer elsewhere.
        const useGitHubOIDCProvider = () => {
            // The assumption here is that self-hosted runners won't be populating the `ACTIONS_ID_TOKEN_REQUEST_TOKEN`
            // environment variable and they won't be providing a web idenity token file or access key either.
            // V2 of the action might relax this a bit and create an explicit precedence for these so that customers
            // can provide as much info as they want and we will follow the established credential loading precedence.
            return !!(roleToAssume && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN && !AccessKeyId && !webIdentityTokenFile);
        };
        const roleDurationSeconds = parseInt(core.getInput('role-duration-seconds', { required: false })) ||
            (SessionToken && SESSION_ROLE_DURATION) ||
            (useGitHubOIDCProvider() && DEFAULT_ROLE_DURATION_FOR_OIDC_ROLES) ||
            MAX_ACTION_RUNTIME;
        if (!region.match(REGION_REGEX)) {
            throw new Error(`Region is not valid: ${region}`);
        }
        exportRegion(region);
        // Always export the source credentials and account ID.
        // The STS client for calling AssumeRole pulls creds from the environment.
        // Plus, in the assume role case, if the AssumeRole call fails, we want
        // the source credentials and account ID to already be masked as secrets
        // in any error messages.
        if (AccessKeyId) {
            if (!SecretAccessKey) {
                throw new Error("'aws-secret-access-key' must be provided if 'aws-access-key-id' is provided");
            }
            exportCredentials({ AccessKeyId, SecretAccessKey, SessionToken });
        }
        // Attempt to load credentials from the GitHub OIDC provider.
        // If a user provides an IAM Role Arn and DOESN'T provide an Access Key Id
        // The only way to assume the role is via GitHub's OIDC provider.
        let sourceAccountId;
        let webIdentityToken;
        if (useGitHubOIDCProvider()) {
            webIdentityToken = await core.getIDToken(audience);
            // We don't validate the credentials here because we don't have them yet when using OIDC.
        }
        else {
            // Regardless of whether any source credentials were provided as inputs,
            // validate that the SDK can actually pick up credentials.  This validates
            // cases where this action is on a self-hosted runner that doesn't have credentials
            // configured correctly, and cases where the user intended to provide input
            // credentials but the secrets inputs resolved to empty strings.
            await validateCredentials(AccessKeyId);
            sourceAccountId = await exportAccountId(region, maskAccountId);
        }
        // Get role credentials if configured to do so
        if (roleToAssume) {
            const roleCredentials = await (0, helpers_1.retryAndBackoff)(async () => {
                return (0, assumeRole_1.assumeRole)({
                    sourceAccountId,
                    region,
                    roleToAssume,
                    roleExternalId,
                    roleDurationSeconds,
                    roleSessionName,
                    roleSkipSessionTagging,
                    webIdentityTokenFile,
                    webIdentityToken,
                });
            }, true);
            exportCredentials(roleCredentials.Credentials);
            // We need to validate the credentials in 2 of our use-cases
            // First: self-hosted runners. If the GITHUB_ACTIONS environment variable
            //  is set to `true` then we are NOT in a self-hosted runner.
            // Second: Customer provided credentials manually (IAM User keys stored in GH Secrets)
            if (!process.env.GITHUB_ACTIONS || AccessKeyId) {
                await validateCredentials(roleCredentials.Credentials?.AccessKeyId);
            }
            await exportAccountId(region, maskAccountId);
        }
    }
    catch (error) {
        core.setFailed((0, helpers_1.errorMessage)(error));
        const showStackTrace = process.env.SHOW_STACK_TRACE;
        if (showStackTrace === 'true') {
            throw error;
        }
    }
}
exports.run = run;
if (require.main === module) {
    (async () => {
        await run();
    })().catch((error) => {
        core.setFailed(error.message);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxvREFBc0M7QUFDdEMsb0RBQXVGO0FBQ3ZGLDZDQUEwQztBQUMxQyx1Q0FBd0U7QUFFeEUsNERBQTREO0FBQzVELHlEQUF5RDtBQUN6RCxNQUFNLGtCQUFrQixHQUFHLENBQUMsR0FBRyxJQUFJLENBQUM7QUFDcEMsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUM7QUFDbkMsTUFBTSxvQ0FBb0MsR0FBRyxJQUFJLENBQUM7QUFDbEQsTUFBTSxVQUFVLEdBQUcsOENBQThDLENBQUM7QUFDbEUsTUFBTSxpQkFBaUIsR0FBRyxlQUFlLENBQUM7QUFDMUMsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDO0FBRXJDLFNBQVMsaUJBQWlCLENBQUMsS0FBNEI7SUFDckQsMEZBQTBGO0lBQzFGLHVFQUF1RTtJQUV2RSxxQkFBcUI7SUFDckIsa0VBQWtFO0lBQ2xFLElBQUksS0FBSyxFQUFFLFdBQVcsRUFBRTtRQUN0QixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNsQyxJQUFJLENBQUMsY0FBYyxDQUFDLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztLQUM3RDtJQUVELHlCQUF5QjtJQUN6QixrSEFBa0g7SUFDbEgsSUFBSSxLQUFLLEVBQUUsZUFBZSxFQUFFO1FBQzFCLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxjQUFjLENBQUMsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0tBQ3JFO0lBRUQscUJBQXFCO0lBQ3JCLHNHQUFzRztJQUN0RyxJQUFJLEtBQUssRUFBRSxZQUFZLEVBQUU7UUFDdkIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbkMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsRUFBRSxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7S0FDOUQ7U0FBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUU7UUFDeEMsdURBQXVEO1FBQ3ZELElBQUksQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxDQUFDLENBQUM7S0FDOUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUMsTUFBYztJQUNsQyxxQ0FBcUM7SUFDckMsK0NBQStDO0lBQy9DLElBQUksQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDbEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDNUMsQ0FBQztBQUVELEtBQUssVUFBVSxlQUFlLENBQUMsTUFBYyxFQUFFLGFBQXVCO0lBQ3BFLHlCQUF5QjtJQUN6QixNQUFNLE1BQU0sR0FBRyxJQUFBLHNCQUFZLEVBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ2hELE1BQU0sUUFBUSxHQUFHLENBQUMsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUkscUNBQXdCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUMvRSxJQUFJLENBQUMsUUFBUSxFQUFFO1FBQ2IsTUFBTSxJQUFJLEtBQUssQ0FBQyw2REFBNkQsQ0FBQyxDQUFDO0tBQ2hGO0lBQ0QsSUFBSSxhQUFhLEVBQUU7UUFDakIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztLQUMxQjtTQUFNO1FBQ0wsSUFBSSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxRQUFRLENBQUMsQ0FBQztLQUM1QztJQUNELE9BQU8sUUFBUSxDQUFDO0FBQ2xCLENBQUM7QUFFRCxTQUFTLGVBQWU7SUFDdEIsc0dBQXNHO0lBQ3RHLEVBQUU7SUFDRixxSEFBcUg7SUFDckgsNEdBQTRHO0lBQzVHLDJHQUEyRztJQUMzRyx5QkFBeUI7SUFDekIsRUFBRTtJQUNGLDZHQUE2RztJQUM3Ryw0RkFBNEY7SUFFNUYsTUFBTSxNQUFNLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2pDLE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQztBQUNyQyxDQUFDO0FBRUQsS0FBSyxVQUFVLG1CQUFtQixDQUFDLG1CQUE0QjtJQUM3RCxJQUFJLFdBQVcsQ0FBQztJQUNoQixJQUFJO1FBQ0YsV0FBVyxHQUFHLE1BQU0sZUFBZSxFQUFFLENBQUM7UUFDdEMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUU7WUFDNUIsTUFBTSxJQUFJLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO1NBQ2xFO0tBQ0Y7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMscUVBQXFFLElBQUEsc0JBQVksRUFBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7S0FDN0c7SUFFRCxNQUFNLGlCQUFpQixHQUFHLFdBQVcsQ0FBQyxXQUFXLENBQUM7SUFFbEQsSUFBSSxtQkFBbUIsSUFBSSxtQkFBbUIsS0FBSyxpQkFBaUIsRUFBRTtRQUNwRSxNQUFNLElBQUksS0FBSyxDQUNiLDJHQUEyRyxDQUM1RyxDQUFDO0tBQ0g7QUFDSCxDQUFDO0FBQ00sS0FBSyxVQUFVLEdBQUc7SUFDdkIsSUFBSTtRQUNGLGFBQWE7UUFDYixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDNUUsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUNoRSxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDcEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUMvRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDN0UsTUFBTSxhQUFhLEdBQ2pCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxDQUFDLFdBQVcsRUFBRSxLQUFLLE1BQU0sQ0FBQztRQUNqRyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDMUUsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsSUFBSSxpQkFBaUIsQ0FBQztRQUNyRyxNQUFNLDJCQUEyQixHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsSUFBSSxPQUFPLENBQUM7UUFDL0csTUFBTSxzQkFBc0IsR0FBRywyQkFBMkIsQ0FBQyxXQUFXLEVBQUUsS0FBSyxNQUFNLENBQUM7UUFDcEYsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLHlCQUF5QixFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFFM0YsNkdBQTZHO1FBQzdHLG9HQUFvRztRQUNwRyxNQUFNLHFCQUFxQixHQUFHLEdBQUcsRUFBRTtZQUNqQywyR0FBMkc7WUFDM0csa0dBQWtHO1lBQ2xHLHdHQUF3RztZQUN4RywwR0FBMEc7WUFDMUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxZQUFZLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDakgsQ0FBQyxDQUFDO1FBQ0YsTUFBTSxtQkFBbUIsR0FDdkIsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUNyRSxDQUFDLFlBQVksSUFBSSxxQkFBcUIsQ0FBQztZQUN2QyxDQUFDLHFCQUFxQixFQUFFLElBQUksb0NBQW9DLENBQUM7WUFDakUsa0JBQWtCLENBQUM7UUFFckIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyx3QkFBd0IsTUFBTSxFQUFFLENBQUMsQ0FBQztTQUNuRDtRQUVELFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVyQix1REFBdUQ7UUFDdkQsMEVBQTBFO1FBQzFFLHVFQUF1RTtRQUN2RSx3RUFBd0U7UUFDeEUseUJBQXlCO1FBQ3pCLElBQUksV0FBVyxFQUFFO1lBQ2YsSUFBSSxDQUFDLGVBQWUsRUFBRTtnQkFDcEIsTUFBTSxJQUFJLEtBQUssQ0FBQyw2RUFBNkUsQ0FBQyxDQUFDO2FBQ2hHO1lBRUQsaUJBQWlCLENBQUMsRUFBRSxXQUFXLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUM7U0FDbkU7UUFFRCw2REFBNkQ7UUFDN0QsMEVBQTBFO1FBQzFFLGlFQUFpRTtRQUNqRSxJQUFJLGVBQXVCLENBQUM7UUFDNUIsSUFBSSxnQkFBd0IsQ0FBQztRQUM3QixJQUFJLHFCQUFxQixFQUFFLEVBQUU7WUFDM0IsZ0JBQWdCLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ25ELHlGQUF5RjtTQUMxRjthQUFNO1lBQ0wsd0VBQXdFO1lBQ3hFLDBFQUEwRTtZQUMxRSxtRkFBbUY7WUFDbkYsMkVBQTJFO1lBQzNFLGdFQUFnRTtZQUNoRSxNQUFNLG1CQUFtQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBRXZDLGVBQWUsR0FBRyxNQUFNLGVBQWUsQ0FBQyxNQUFNLEVBQUUsYUFBYSxDQUFDLENBQUM7U0FDaEU7UUFFRCw4Q0FBOEM7UUFDOUMsSUFBSSxZQUFZLEVBQUU7WUFDaEIsTUFBTSxlQUFlLEdBQUcsTUFBTSxJQUFBLHlCQUFlLEVBQUMsS0FBSyxJQUFJLEVBQUU7Z0JBQ3ZELE9BQU8sSUFBQSx1QkFBVSxFQUFDO29CQUNoQixlQUFlO29CQUNmLE1BQU07b0JBQ04sWUFBWTtvQkFDWixjQUFjO29CQUNkLG1CQUFtQjtvQkFDbkIsZUFBZTtvQkFDZixzQkFBc0I7b0JBQ3RCLG9CQUFvQjtvQkFDcEIsZ0JBQWdCO2lCQUNqQixDQUFDLENBQUM7WUFDTCxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDVCxpQkFBaUIsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDL0MsNERBQTREO1lBQzVELHlFQUF5RTtZQUN6RSw2REFBNkQ7WUFDN0Qsc0ZBQXNGO1lBQ3RGLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxXQUFXLEVBQUU7Z0JBQzlDLE1BQU0sbUJBQW1CLENBQUMsZUFBZSxDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQzthQUNyRTtZQUNELE1BQU0sZUFBZSxDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsQ0FBQztTQUM5QztLQUNGO0lBQUMsT0FBTyxLQUFLLEVBQUU7UUFDZCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUEsc0JBQVksRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBRXBDLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUM7UUFFcEQsSUFBSSxjQUFjLEtBQUssTUFBTSxFQUFFO1lBQzdCLE1BQU0sS0FBSyxDQUFDO1NBQ2I7S0FDRjtBQUNILENBQUM7QUF4R0Qsa0JBd0dDO0FBRUQsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRTtJQUMzQixDQUFDLEtBQUssSUFBSSxFQUFFO1FBQ1YsTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUNkLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7UUFDbkIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDaEMsQ0FBQyxDQUFDLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNvcmUgZnJvbSAnQGFjdGlvbnMvY29yZSc7XG5pbXBvcnQgeyBDcmVkZW50aWFscywgR2V0Q2FsbGVySWRlbnRpdHlDb21tYW5kLCBTVFNDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3RzJztcbmltcG9ydCB7IGFzc3VtZVJvbGUgfSBmcm9tICcuL2Fzc3VtZVJvbGUnO1xuaW1wb3J0IHsgZXJyb3JNZXNzYWdlLCBnZXRTdHNDbGllbnQsIHJldHJ5QW5kQmFja29mZiB9IGZyb20gJy4vaGVscGVycyc7XG5cbi8vIFVzZSAxaHIgYXMgcm9sZSBkdXJhdGlvbiB3aGVuIHVzaW5nIHNlc3Npb24gdG9rZW4gb3IgT0lEQ1xuLy8gT3RoZXJ3aXNlLCB1c2UgdGhlIG1heCBkdXJhdGlvbiBvZiBHaXRIdWIgYWN0aW9uICg2aHIpXG5jb25zdCBNQVhfQUNUSU9OX1JVTlRJTUUgPSA2ICogMzYwMDtcbmNvbnN0IFNFU1NJT05fUk9MRV9EVVJBVElPTiA9IDM2MDA7XG5jb25zdCBERUZBVUxUX1JPTEVfRFVSQVRJT05fRk9SX09JRENfUk9MRVMgPSAzNjAwO1xuY29uc3QgVVNFUl9BR0VOVCA9ICdjb25maWd1cmUtYXdzLWNyZWRlbnRpYWxzLWZvci1naXRodWItYWN0aW9ucyc7XG5jb25zdCBST0xFX1NFU1NJT05fTkFNRSA9ICdHaXRIdWJBY3Rpb25zJztcbmNvbnN0IFJFR0lPTl9SRUdFWCA9IC9eW2EtejAtOS1dKyQvZztcblxuZnVuY3Rpb24gZXhwb3J0Q3JlZGVudGlhbHMoY3JlZHM/OiBQYXJ0aWFsPENyZWRlbnRpYWxzPikge1xuICAvLyBDb25maWd1cmUgdGhlIEFXUyBDTEkgYW5kIEFXUyBTREtzIHVzaW5nIGVudmlyb25tZW50IHZhcmlhYmxlcyBhbmQgc2V0IHRoZW0gYXMgc2VjcmV0cy5cbiAgLy8gU2V0dGluZyB0aGUgY3JlZGVudGlhbHMgYXMgc2VjcmV0cyBtYXNrcyB0aGVtIGluIEdpdGh1YiBBY3Rpb25zIGxvZ3NcblxuICAvLyBBV1NfQUNDRVNTX0tFWV9JRDpcbiAgLy8gU3BlY2lmaWVzIGFuIEFXUyBhY2Nlc3Mga2V5IGFzc29jaWF0ZWQgd2l0aCBhbiBJQU0gdXNlciBvciByb2xlXG4gIGlmIChjcmVkcz8uQWNjZXNzS2V5SWQpIHtcbiAgICBjb3JlLnNldFNlY3JldChjcmVkcy5BY2Nlc3NLZXlJZCk7XG4gICAgY29yZS5leHBvcnRWYXJpYWJsZSgnQVdTX0FDQ0VTU19LRVlfSUQnLCBjcmVkcy5BY2Nlc3NLZXlJZCk7XG4gIH1cblxuICAvLyBBV1NfU0VDUkVUX0FDQ0VTU19LRVk6XG4gIC8vIFNwZWNpZmllcyB0aGUgc2VjcmV0IGtleSBhc3NvY2lhdGVkIHdpdGggdGhlIGFjY2VzcyBrZXkuIFRoaXMgaXMgZXNzZW50aWFsbHkgdGhlIFwicGFzc3dvcmRcIiBmb3IgdGhlIGFjY2VzcyBrZXkuXG4gIGlmIChjcmVkcz8uU2VjcmV0QWNjZXNzS2V5KSB7XG4gICAgY29yZS5zZXRTZWNyZXQoY3JlZHMuU2VjcmV0QWNjZXNzS2V5KTtcbiAgICBjb3JlLmV4cG9ydFZhcmlhYmxlKCdBV1NfU0VDUkVUX0FDQ0VTU19LRVknLCBjcmVkcy5TZWNyZXRBY2Nlc3NLZXkpO1xuICB9XG5cbiAgLy8gQVdTX1NFU1NJT05fVE9LRU46XG4gIC8vIFNwZWNpZmllcyB0aGUgc2Vzc2lvbiB0b2tlbiB2YWx1ZSB0aGF0IGlzIHJlcXVpcmVkIGlmIHlvdSBhcmUgdXNpbmcgdGVtcG9yYXJ5IHNlY3VyaXR5IGNyZWRlbnRpYWxzLlxuICBpZiAoY3JlZHM/LlNlc3Npb25Ub2tlbikge1xuICAgIGNvcmUuc2V0U2VjcmV0KGNyZWRzLlNlc3Npb25Ub2tlbik7XG4gICAgY29yZS5leHBvcnRWYXJpYWJsZSgnQVdTX1NFU1NJT05fVE9LRU4nLCBjcmVkcy5TZXNzaW9uVG9rZW4pO1xuICB9IGVsc2UgaWYgKHByb2Nlc3MuZW52LkFXU19TRVNTSU9OX1RPS0VOKSB7XG4gICAgLy8gY2xlYXIgc2Vzc2lvbiB0b2tlbiBmcm9tIHByZXZpb3VzIGNyZWRlbnRpYWxzIGFjdGlvblxuICAgIGNvcmUuZXhwb3J0VmFyaWFibGUoJ0FXU19TRVNTSU9OX1RPS0VOJywgJycpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGV4cG9ydFJlZ2lvbihyZWdpb246IHN0cmluZykge1xuICAvLyBBV1NfREVGQVVMVF9SRUdJT04gYW5kIEFXU19SRUdJT046XG4gIC8vIFNwZWNpZmllcyB0aGUgQVdTIFJlZ2lvbiB0byBzZW5kIHJlcXVlc3RzIHRvXG4gIGNvcmUuZXhwb3J0VmFyaWFibGUoJ0FXU19ERUZBVUxUX1JFR0lPTicsIHJlZ2lvbik7XG4gIGNvcmUuZXhwb3J0VmFyaWFibGUoJ0FXU19SRUdJT04nLCByZWdpb24pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBleHBvcnRBY2NvdW50SWQocmVnaW9uOiBzdHJpbmcsIG1hc2tBY2NvdW50SWQ/OiBib29sZWFuKSB7XG4gIC8vIEdldCB0aGUgQVdTIGFjY291bnQgSURcbiAgY29uc3QgY2xpZW50ID0gZ2V0U3RzQ2xpZW50KHJlZ2lvbiwgVVNFUl9BR0VOVCk7XG4gIGNvbnN0IGlkZW50aXR5ID0gKGF3YWl0IGNsaWVudC5zZW5kKG5ldyBHZXRDYWxsZXJJZGVudGl0eUNvbW1hbmQoe30pKSkuQWNjb3VudDtcbiAgaWYgKCFpZGVudGl0eSkge1xuICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGdldCBBY2NvdW50IElEIGZyb20gU1RTLiBEaWQgeW91IHNldCBjcmVkZW50aWFscz8nKTtcbiAgfVxuICBpZiAobWFza0FjY291bnRJZCkge1xuICAgIGNvcmUuc2V0U2VjcmV0KGlkZW50aXR5KTtcbiAgfSBlbHNlIHtcbiAgICBjb3JlLnNldE91dHB1dCgnYXdzLWFjY291bnQtaWQnLCBpZGVudGl0eSk7XG4gIH1cbiAgcmV0dXJuIGlkZW50aXR5O1xufVxuXG5mdW5jdGlvbiBsb2FkQ3JlZGVudGlhbHMoKSB7XG4gIC8vIFByZXZpb3VzbHksIHRoaXMgZnVuY3Rpb24gZm9yY2VkIHRoZSBTREsgdG8gcmUtcmVzb2x2ZSBjcmVkZW50aWFscyB3aXRoIHRoZSBkZWZhdWx0IHByb3ZpZGVyIGNoYWluLlxuICAvL1xuICAvLyBUaGlzIGFjdGlvbiB0eXBpY2FsbHkgc2V0cyBjcmVkZW50aWFscyBpbiB0aGUgZW52aXJvbm1lbnQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlcy4gVGhlIFNESyBuZXZlciByZWZyZXNoZWQgdGhvc2VcbiAgLy8gZW52LXZhci1iYXNlZCBjcmVkZW50aWFscyBhZnRlciBpbml0aWFsIGxvYWQuIEluIGNhc2UgdGhlcmUgd2VyZSBhbHJlYWR5IGVudi12YXIgY3JlZHMgc2V0IGluIHRoZSBhY3Rpb25zXG4gIC8vIGVudmlyb25tZW50IHdoZW4gdGhpcyBhY3Rpb24gbG9hZGVkLCB0aGlzIGFjdGlvbiBuZWVkZWQgdG8gcmVmcmVzaCB0aGUgU0RLIGNyZWRzIGFmdGVyIG92ZXJ3cml0aW5nIHRob3NlXG4gIC8vIGVudmlyb25tZW50IHZhcmlhYmxlcy5cbiAgLy9cbiAgLy8gSG93ZXZlciwgaW4gVjMgb2YgdGhlIEphdmFTY3JpcHQgU0RLLCB0aGVyZSBpcyBubyBsb25nZXIgYSBnbG9iYWwgY29uZmlndXJhdGlvbiBvYmplY3Q6IGFsbCBjb25maWd1cmF0aW9uLFxuICAvLyBpbmNsdWRpbmcgY3JlZGVudGlhbHMsIGFyZSBpbnN0YW50aWF0ZWQgcGVyIGNsaWVudCBhbmQgbm90IG1lcmdlZCBiYWNrIGludG8gZ2xvYmFsIHN0YXRlLlxuXG4gIGNvbnN0IGNsaWVudCA9IG5ldyBTVFNDbGllbnQoe30pO1xuICByZXR1cm4gY2xpZW50LmNvbmZpZy5jcmVkZW50aWFscygpO1xufVxuXG5hc3luYyBmdW5jdGlvbiB2YWxpZGF0ZUNyZWRlbnRpYWxzKGV4cGVjdGVkQWNjZXNzS2V5SWQ/OiBzdHJpbmcpIHtcbiAgbGV0IGNyZWRlbnRpYWxzO1xuICB0cnkge1xuICAgIGNyZWRlbnRpYWxzID0gYXdhaXQgbG9hZENyZWRlbnRpYWxzKCk7XG4gICAgaWYgKCFjcmVkZW50aWFscy5hY2Nlc3NLZXlJZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdBY2Nlc3Mga2V5IElEIGVtcHR5IGFmdGVyIGxvYWRpbmcgY3JlZGVudGlhbHMnKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBDcmVkZW50aWFscyBjb3VsZCBub3QgYmUgbG9hZGVkLCBwbGVhc2UgY2hlY2sgeW91ciBhY3Rpb24gaW5wdXRzOiAke2Vycm9yTWVzc2FnZShlcnJvcil9YCk7XG4gIH1cblxuICBjb25zdCBhY3R1YWxBY2Nlc3NLZXlJZCA9IGNyZWRlbnRpYWxzLmFjY2Vzc0tleUlkO1xuXG4gIGlmIChleHBlY3RlZEFjY2Vzc0tleUlkICYmIGV4cGVjdGVkQWNjZXNzS2V5SWQgIT09IGFjdHVhbEFjY2Vzc0tleUlkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgJ1VuZXhwZWN0ZWQgZmFpbHVyZTogQ3JlZGVudGlhbHMgbG9hZGVkIGJ5IHRoZSBTREsgZG8gbm90IG1hdGNoIHRoZSBhY2Nlc3Mga2V5IElEIGNvbmZpZ3VyZWQgYnkgdGhlIGFjdGlvbidcbiAgICApO1xuICB9XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuKCkge1xuICB0cnkge1xuICAgIC8vIEdldCBpbnB1dHNcbiAgICBjb25zdCBBY2Nlc3NLZXlJZCA9IGNvcmUuZ2V0SW5wdXQoJ2F3cy1hY2Nlc3Mta2V5LWlkJywgeyByZXF1aXJlZDogZmFsc2UgfSk7XG4gICAgY29uc3QgYXVkaWVuY2UgPSBjb3JlLmdldElucHV0KCdhdWRpZW5jZScsIHsgcmVxdWlyZWQ6IGZhbHNlIH0pO1xuICAgIGNvbnN0IFNlY3JldEFjY2Vzc0tleSA9IGNvcmUuZ2V0SW5wdXQoJ2F3cy1zZWNyZXQtYWNjZXNzLWtleScsIHsgcmVxdWlyZWQ6IGZhbHNlIH0pO1xuICAgIGNvbnN0IHJlZ2lvbiA9IGNvcmUuZ2V0SW5wdXQoJ2F3cy1yZWdpb24nLCB7IHJlcXVpcmVkOiB0cnVlIH0pO1xuICAgIGNvbnN0IFNlc3Npb25Ub2tlbiA9IGNvcmUuZ2V0SW5wdXQoJ2F3cy1zZXNzaW9uLXRva2VuJywgeyByZXF1aXJlZDogZmFsc2UgfSk7XG4gICAgY29uc3QgbWFza0FjY291bnRJZCA9XG4gICAgICAoY29yZS5nZXRJbnB1dCgnbWFzay1hd3MtYWNjb3VudC1pZCcsIHsgcmVxdWlyZWQ6IGZhbHNlIH0pIHx8ICd0cnVlJykudG9Mb3dlckNhc2UoKSA9PT0gJ3RydWUnO1xuICAgIGNvbnN0IHJvbGVUb0Fzc3VtZSA9IGNvcmUuZ2V0SW5wdXQoJ3JvbGUtdG8tYXNzdW1lJywgeyByZXF1aXJlZDogZmFsc2UgfSk7XG4gICAgY29uc3Qgcm9sZUV4dGVybmFsSWQgPSBjb3JlLmdldElucHV0KCdyb2xlLWV4dGVybmFsLWlkJywgeyByZXF1aXJlZDogZmFsc2UgfSk7XG4gICAgY29uc3Qgcm9sZVNlc3Npb25OYW1lID0gY29yZS5nZXRJbnB1dCgncm9sZS1zZXNzaW9uLW5hbWUnLCB7IHJlcXVpcmVkOiBmYWxzZSB9KSB8fCBST0xFX1NFU1NJT05fTkFNRTtcbiAgICBjb25zdCByb2xlU2tpcFNlc3Npb25UYWdnaW5nSW5wdXQgPSBjb3JlLmdldElucHV0KCdyb2xlLXNraXAtc2Vzc2lvbi10YWdnaW5nJywgeyByZXF1aXJlZDogZmFsc2UgfSkgfHwgJ2ZhbHNlJztcbiAgICBjb25zdCByb2xlU2tpcFNlc3Npb25UYWdnaW5nID0gcm9sZVNraXBTZXNzaW9uVGFnZ2luZ0lucHV0LnRvTG93ZXJDYXNlKCkgPT09ICd0cnVlJztcbiAgICBjb25zdCB3ZWJJZGVudGl0eVRva2VuRmlsZSA9IGNvcmUuZ2V0SW5wdXQoJ3dlYi1pZGVudGl0eS10b2tlbi1maWxlJywgeyByZXF1aXJlZDogZmFsc2UgfSk7XG5cbiAgICAvLyBUaGlzIHdyYXBzIHRoZSBsb2dpYyBmb3IgZGVjaWRpbmcgaWYgd2Ugc2hvdWxkIHJlbHkgb24gdGhlIEdIIE9JREMgcHJvdmlkZXIgc2luY2Ugd2UgbWF5IG5lZWQgdG8gcmVmZXJlbmNlXG4gICAgLy8gdGhlIGRlY2lzaW9uIGluIGEgZmV3IGRpZmZlcmVubnQgcGxhY2VzLiBDb25zb2xpZGF0aW5nIGl0IGhlcmUgbWFrZXMgdGhlIGxvZ2ljIGNsZWFyZXIgZWxzZXdoZXJlLlxuICAgIGNvbnN0IHVzZUdpdEh1Yk9JRENQcm92aWRlciA9ICgpID0+IHtcbiAgICAgIC8vIFRoZSBhc3N1bXB0aW9uIGhlcmUgaXMgdGhhdCBzZWxmLWhvc3RlZCBydW5uZXJzIHdvbid0IGJlIHBvcHVsYXRpbmcgdGhlIGBBQ1RJT05TX0lEX1RPS0VOX1JFUVVFU1RfVE9LRU5gXG4gICAgICAvLyBlbnZpcm9ubWVudCB2YXJpYWJsZSBhbmQgdGhleSB3b24ndCBiZSBwcm92aWRpbmcgYSB3ZWIgaWRlbml0eSB0b2tlbiBmaWxlIG9yIGFjY2VzcyBrZXkgZWl0aGVyLlxuICAgICAgLy8gVjIgb2YgdGhlIGFjdGlvbiBtaWdodCByZWxheCB0aGlzIGEgYml0IGFuZCBjcmVhdGUgYW4gZXhwbGljaXQgcHJlY2VkZW5jZSBmb3IgdGhlc2Ugc28gdGhhdCBjdXN0b21lcnNcbiAgICAgIC8vIGNhbiBwcm92aWRlIGFzIG11Y2ggaW5mbyBhcyB0aGV5IHdhbnQgYW5kIHdlIHdpbGwgZm9sbG93IHRoZSBlc3RhYmxpc2hlZCBjcmVkZW50aWFsIGxvYWRpbmcgcHJlY2VkZW5jZS5cbiAgICAgIHJldHVybiAhIShyb2xlVG9Bc3N1bWUgJiYgcHJvY2Vzcy5lbnYuQUNUSU9OU19JRF9UT0tFTl9SRVFVRVNUX1RPS0VOICYmICFBY2Nlc3NLZXlJZCAmJiAhd2ViSWRlbnRpdHlUb2tlbkZpbGUpO1xuICAgIH07XG4gICAgY29uc3Qgcm9sZUR1cmF0aW9uU2Vjb25kcyA9XG4gICAgICBwYXJzZUludChjb3JlLmdldElucHV0KCdyb2xlLWR1cmF0aW9uLXNlY29uZHMnLCB7IHJlcXVpcmVkOiBmYWxzZSB9KSkgfHxcbiAgICAgIChTZXNzaW9uVG9rZW4gJiYgU0VTU0lPTl9ST0xFX0RVUkFUSU9OKSB8fFxuICAgICAgKHVzZUdpdEh1Yk9JRENQcm92aWRlcigpICYmIERFRkFVTFRfUk9MRV9EVVJBVElPTl9GT1JfT0lEQ19ST0xFUykgfHxcbiAgICAgIE1BWF9BQ1RJT05fUlVOVElNRTtcblxuICAgIGlmICghcmVnaW9uLm1hdGNoKFJFR0lPTl9SRUdFWCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgUmVnaW9uIGlzIG5vdCB2YWxpZDogJHtyZWdpb259YCk7XG4gICAgfVxuXG4gICAgZXhwb3J0UmVnaW9uKHJlZ2lvbik7XG5cbiAgICAvLyBBbHdheXMgZXhwb3J0IHRoZSBzb3VyY2UgY3JlZGVudGlhbHMgYW5kIGFjY291bnQgSUQuXG4gICAgLy8gVGhlIFNUUyBjbGllbnQgZm9yIGNhbGxpbmcgQXNzdW1lUm9sZSBwdWxscyBjcmVkcyBmcm9tIHRoZSBlbnZpcm9ubWVudC5cbiAgICAvLyBQbHVzLCBpbiB0aGUgYXNzdW1lIHJvbGUgY2FzZSwgaWYgdGhlIEFzc3VtZVJvbGUgY2FsbCBmYWlscywgd2Ugd2FudFxuICAgIC8vIHRoZSBzb3VyY2UgY3JlZGVudGlhbHMgYW5kIGFjY291bnQgSUQgdG8gYWxyZWFkeSBiZSBtYXNrZWQgYXMgc2VjcmV0c1xuICAgIC8vIGluIGFueSBlcnJvciBtZXNzYWdlcy5cbiAgICBpZiAoQWNjZXNzS2V5SWQpIHtcbiAgICAgIGlmICghU2VjcmV0QWNjZXNzS2V5KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIidhd3Mtc2VjcmV0LWFjY2Vzcy1rZXknIG11c3QgYmUgcHJvdmlkZWQgaWYgJ2F3cy1hY2Nlc3Mta2V5LWlkJyBpcyBwcm92aWRlZFwiKTtcbiAgICAgIH1cblxuICAgICAgZXhwb3J0Q3JlZGVudGlhbHMoeyBBY2Nlc3NLZXlJZCwgU2VjcmV0QWNjZXNzS2V5LCBTZXNzaW9uVG9rZW4gfSk7XG4gICAgfVxuXG4gICAgLy8gQXR0ZW1wdCB0byBsb2FkIGNyZWRlbnRpYWxzIGZyb20gdGhlIEdpdEh1YiBPSURDIHByb3ZpZGVyLlxuICAgIC8vIElmIGEgdXNlciBwcm92aWRlcyBhbiBJQU0gUm9sZSBBcm4gYW5kIERPRVNOJ1QgcHJvdmlkZSBhbiBBY2Nlc3MgS2V5IElkXG4gICAgLy8gVGhlIG9ubHkgd2F5IHRvIGFzc3VtZSB0aGUgcm9sZSBpcyB2aWEgR2l0SHViJ3MgT0lEQyBwcm92aWRlci5cbiAgICBsZXQgc291cmNlQWNjb3VudElkOiBzdHJpbmc7XG4gICAgbGV0IHdlYklkZW50aXR5VG9rZW46IHN0cmluZztcbiAgICBpZiAodXNlR2l0SHViT0lEQ1Byb3ZpZGVyKCkpIHtcbiAgICAgIHdlYklkZW50aXR5VG9rZW4gPSBhd2FpdCBjb3JlLmdldElEVG9rZW4oYXVkaWVuY2UpO1xuICAgICAgLy8gV2UgZG9uJ3QgdmFsaWRhdGUgdGhlIGNyZWRlbnRpYWxzIGhlcmUgYmVjYXVzZSB3ZSBkb24ndCBoYXZlIHRoZW0geWV0IHdoZW4gdXNpbmcgT0lEQy5cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUmVnYXJkbGVzcyBvZiB3aGV0aGVyIGFueSBzb3VyY2UgY3JlZGVudGlhbHMgd2VyZSBwcm92aWRlZCBhcyBpbnB1dHMsXG4gICAgICAvLyB2YWxpZGF0ZSB0aGF0IHRoZSBTREsgY2FuIGFjdHVhbGx5IHBpY2sgdXAgY3JlZGVudGlhbHMuICBUaGlzIHZhbGlkYXRlc1xuICAgICAgLy8gY2FzZXMgd2hlcmUgdGhpcyBhY3Rpb24gaXMgb24gYSBzZWxmLWhvc3RlZCBydW5uZXIgdGhhdCBkb2Vzbid0IGhhdmUgY3JlZGVudGlhbHNcbiAgICAgIC8vIGNvbmZpZ3VyZWQgY29ycmVjdGx5LCBhbmQgY2FzZXMgd2hlcmUgdGhlIHVzZXIgaW50ZW5kZWQgdG8gcHJvdmlkZSBpbnB1dFxuICAgICAgLy8gY3JlZGVudGlhbHMgYnV0IHRoZSBzZWNyZXRzIGlucHV0cyByZXNvbHZlZCB0byBlbXB0eSBzdHJpbmdzLlxuICAgICAgYXdhaXQgdmFsaWRhdGVDcmVkZW50aWFscyhBY2Nlc3NLZXlJZCk7XG5cbiAgICAgIHNvdXJjZUFjY291bnRJZCA9IGF3YWl0IGV4cG9ydEFjY291bnRJZChyZWdpb24sIG1hc2tBY2NvdW50SWQpO1xuICAgIH1cblxuICAgIC8vIEdldCByb2xlIGNyZWRlbnRpYWxzIGlmIGNvbmZpZ3VyZWQgdG8gZG8gc29cbiAgICBpZiAocm9sZVRvQXNzdW1lKSB7XG4gICAgICBjb25zdCByb2xlQ3JlZGVudGlhbHMgPSBhd2FpdCByZXRyeUFuZEJhY2tvZmYoYXN5bmMgKCkgPT4ge1xuICAgICAgICByZXR1cm4gYXNzdW1lUm9sZSh7XG4gICAgICAgICAgc291cmNlQWNjb3VudElkLFxuICAgICAgICAgIHJlZ2lvbixcbiAgICAgICAgICByb2xlVG9Bc3N1bWUsXG4gICAgICAgICAgcm9sZUV4dGVybmFsSWQsXG4gICAgICAgICAgcm9sZUR1cmF0aW9uU2Vjb25kcyxcbiAgICAgICAgICByb2xlU2Vzc2lvbk5hbWUsXG4gICAgICAgICAgcm9sZVNraXBTZXNzaW9uVGFnZ2luZyxcbiAgICAgICAgICB3ZWJJZGVudGl0eVRva2VuRmlsZSxcbiAgICAgICAgICB3ZWJJZGVudGl0eVRva2VuLFxuICAgICAgICB9KTtcbiAgICAgIH0sIHRydWUpO1xuICAgICAgZXhwb3J0Q3JlZGVudGlhbHMocm9sZUNyZWRlbnRpYWxzLkNyZWRlbnRpYWxzKTtcbiAgICAgIC8vIFdlIG5lZWQgdG8gdmFsaWRhdGUgdGhlIGNyZWRlbnRpYWxzIGluIDIgb2Ygb3VyIHVzZS1jYXNlc1xuICAgICAgLy8gRmlyc3Q6IHNlbGYtaG9zdGVkIHJ1bm5lcnMuIElmIHRoZSBHSVRIVUJfQUNUSU9OUyBlbnZpcm9ubWVudCB2YXJpYWJsZVxuICAgICAgLy8gIGlzIHNldCB0byBgdHJ1ZWAgdGhlbiB3ZSBhcmUgTk9UIGluIGEgc2VsZi1ob3N0ZWQgcnVubmVyLlxuICAgICAgLy8gU2Vjb25kOiBDdXN0b21lciBwcm92aWRlZCBjcmVkZW50aWFscyBtYW51YWxseSAoSUFNIFVzZXIga2V5cyBzdG9yZWQgaW4gR0ggU2VjcmV0cylcbiAgICAgIGlmICghcHJvY2Vzcy5lbnYuR0lUSFVCX0FDVElPTlMgfHwgQWNjZXNzS2V5SWQpIHtcbiAgICAgICAgYXdhaXQgdmFsaWRhdGVDcmVkZW50aWFscyhyb2xlQ3JlZGVudGlhbHMuQ3JlZGVudGlhbHM/LkFjY2Vzc0tleUlkKTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IGV4cG9ydEFjY291bnRJZChyZWdpb24sIG1hc2tBY2NvdW50SWQpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb3JlLnNldEZhaWxlZChlcnJvck1lc3NhZ2UoZXJyb3IpKTtcblxuICAgIGNvbnN0IHNob3dTdGFja1RyYWNlID0gcHJvY2Vzcy5lbnYuU0hPV19TVEFDS19UUkFDRTtcblxuICAgIGlmIChzaG93U3RhY2tUcmFjZSA9PT0gJ3RydWUnKSB7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cbn1cblxuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XG4gIChhc3luYyAoKSA9PiB7XG4gICAgYXdhaXQgcnVuKCk7XG4gIH0pKCkuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgY29yZS5zZXRGYWlsZWQoZXJyb3IubWVzc2FnZSk7XG4gIH0pO1xufVxuIl19