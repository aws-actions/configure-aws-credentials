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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assumeRole = void 0;
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const core = __importStar(require("@actions/core"));
const client_sts_1 = require("@aws-sdk/client-sts");
const helpers_1 = require("./helpers");
const SANITIZATION_CHARACTER = '_';
const MAX_TAG_VALUE_LENGTH = 256;
function sanitizeGithubActor(actor) {
    // In some circumstances the actor may contain square brackets. For example, if they're a bot ('[bot]')
    // Square brackets are not allowed in AWS session tags
    return actor.replace(/\[|\]/g, SANITIZATION_CHARACTER);
}
function sanitizeGithubWorkflowName(name) {
    // Workflow names can be almost any valid UTF-8 string, but tags are more restrictive.
    // This replaces anything not conforming to the tag restrictions by inverting the regular expression.
    // See the AWS documentation for constraint specifics https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html.
    const nameWithoutSpecialCharacters = name.replace(/[^\p{L}\p{Z}\p{N}_:/=+.-@-]/gu, SANITIZATION_CHARACTER);
    const nameTruncated = nameWithoutSpecialCharacters.slice(0, MAX_TAG_VALUE_LENGTH);
    return nameTruncated;
}
async function assumeRole(params) {
    // Assume a role to get short-lived credentials using longer-lived credentials.
    const { sourceAccountId, roleToAssume, roleExternalId, roleDurationSeconds, roleSessionName, region, roleSkipSessionTagging, webIdentityTokenFile, webIdentityToken, } = { ...params };
    const { GITHUB_REPOSITORY, GITHUB_WORKFLOW, GITHUB_ACTION, GITHUB_ACTOR, GITHUB_SHA, GITHUB_WORKSPACE } = process.env;
    if (!GITHUB_REPOSITORY || !GITHUB_WORKFLOW || !GITHUB_ACTION || !GITHUB_ACTOR || !GITHUB_SHA || !GITHUB_WORKSPACE) {
        throw new Error('Missing required environment variables. Are you running in GitHub Actions?');
    }
    let RoleArn = roleToAssume;
    if (!RoleArn.startsWith('arn:aws')) {
        // Supports only 'aws' partition. Customers in other partitions ('aws-cn') will need to provide full ARN
        (0, assert_1.default)((0, helpers_1.isDefined)(sourceAccountId), 'Source Account ID is needed if the Role Name is provided and not the Role Arn.');
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
    }
    else {
        core.debug(Tags.length + ' role session tags are being used.');
    }
    const commonAssumeRoleParams = {
        RoleArn,
        RoleSessionName: roleSessionName,
        DurationSeconds: roleDurationSeconds,
        Tags,
        ExternalId: roleExternalId,
    };
    const keys = Object.keys(commonAssumeRoleParams);
    keys.forEach((k) => commonAssumeRoleParams[k] === undefined && delete commonAssumeRoleParams[k]);
    let assumeRoleCommand;
    switch (true) {
        case !!webIdentityToken: {
            delete commonAssumeRoleParams.Tags;
            assumeRoleCommand = new client_sts_1.AssumeRoleWithWebIdentityCommand({
                ...commonAssumeRoleParams,
                WebIdentityToken: webIdentityToken,
            });
            break;
        }
        case !!webIdentityTokenFile: {
            core.debug('webIdentityTokenFile provided. Will call sts:AssumeRoleWithWebIdentity and take session tags from token contents.');
            const webIdentityTokenFilePath = path_1.default.isAbsolute(webIdentityTokenFile)
                ? webIdentityTokenFile
                : path_1.default.join(GITHUB_WORKSPACE, webIdentityTokenFile);
            if (!fs_1.default.existsSync(webIdentityTokenFilePath)) {
                throw new Error(`Web identity token file does not exist: ${webIdentityTokenFilePath}`);
            }
            try {
                const widt = await fs_1.default.promises.readFile(webIdentityTokenFilePath, 'utf8');
                delete commonAssumeRoleParams.Tags;
                assumeRoleCommand = new client_sts_1.AssumeRoleWithWebIdentityCommand({
                    ...commonAssumeRoleParams,
                    WebIdentityToken: widt,
                });
            }
            catch (error) {
                throw new Error(`Web identity token file could not be read: ${(0, helpers_1.errorMessage)(error)}`);
            }
            break;
        }
        default:
            throw new Error('No web identity token or web identity token file provided.');
    }
    const sts = (0, helpers_1.getStsClient)(region);
    return sts.send(assumeRoleCommand);
}
exports.assumeRole = assumeRole;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzdW1lUm9sZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9hc3N1bWVSb2xlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsb0RBQTRCO0FBQzVCLDRDQUFvQjtBQUNwQixnREFBd0I7QUFDeEIsb0RBQXNDO0FBQ3RDLG9EQUErRjtBQUMvRix1Q0FBa0U7QUFFbEUsTUFBTSxzQkFBc0IsR0FBRyxHQUFHLENBQUM7QUFDbkMsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUM7QUFFakMsU0FBUyxtQkFBbUIsQ0FBQyxLQUFhO0lBQ3hDLHVHQUF1RztJQUN2RyxzREFBc0Q7SUFDdEQsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO0FBQ3pELENBQUM7QUFFRCxTQUFTLDBCQUEwQixDQUFDLElBQVk7SUFDOUMsc0ZBQXNGO0lBQ3RGLHFHQUFxRztJQUNyRyx1SEFBdUg7SUFDdkgsTUFBTSw0QkFBNEIsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLCtCQUErQixFQUFFLHNCQUFzQixDQUFDLENBQUM7SUFDM0csTUFBTSxhQUFhLEdBQUcsNEJBQTRCLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0lBQ2xGLE9BQU8sYUFBYSxDQUFDO0FBQ3ZCLENBQUM7QUFjTSxLQUFLLFVBQVUsVUFBVSxDQUFDLE1BQXdCO0lBQ3ZELCtFQUErRTtJQUMvRSxNQUFNLEVBQ0osZUFBZSxFQUNmLFlBQVksRUFDWixjQUFjLEVBQ2QsbUJBQW1CLEVBQ25CLGVBQWUsRUFDZixNQUFNLEVBQ04sc0JBQXNCLEVBQ3RCLG9CQUFvQixFQUNwQixnQkFBZ0IsR0FDakIsR0FBRyxFQUFFLEdBQUcsTUFBTSxFQUFFLENBQUM7SUFFbEIsTUFBTSxFQUFFLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLFVBQVUs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QUMsb0JBQXFCLENBQUM7Z0JBQ3JFLENBQUMsQ0FBQyxvQkFBcUI7Z0JBQ3ZCLENBQUMsQ0FBQyxjQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLG9CQUFxQixDQUFDLENBQUM7WUFDdkQsSUFBSSxDQUFDLFlBQUUsQ0FBQyxVQUFVLENBQUMsd0JBQXdCLENBQUMsRUFBRTtnQkFDNUMsTUFBTSxJQUFJLEtBQUssQ0FBQywyQ0FBMkMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO2FBQ3hGO1lBRUQsSUFBSTtnQkFDRixNQUFNLElBQUksR0FBRyxNQUFNLFlBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUMxRSxPQUFPLHNCQUFzQixDQUFDLElBQUksQ0FBQztnQkFDbkMsaUJBQWlCLEdBQUcsSUFBSSw2Q0FBZ0MsQ0FBQztvQkFDdkQsR0FBRyxzQkFBc0I7b0JBQ3pCLGdCQUFnQixFQUFFLElBQUk7aUJBQ3ZCLENBQUMsQ0FBQzthQUNKO1lBQUMsT0FBTyxLQUFLLEVBQUU7Z0JBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyw4Q0FBOEMsSUFBQSxzQkFBWSxFQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUN0RjtZQUNELE1BQU07U0FDUDtRQUNEO1lBQ0UsTUFBTSxJQUFJLEtBQUssQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO0tBQ2pGO0lBRUQsTUFBTSxHQUFHLEdBQUcsSUFBQSxzQkFBWSxFQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2pDLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBQ3JDLENBQUM7QUFuR0QsZ0NBbUdDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgY29yZSBmcm9tICdAYWN0aW9ucy9jb3JlJztcbmltcG9ydCB7IEFzc3VtZVJvbGVDb21tYW5kSW5wdXQsIEFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXN0cyc7XG5pbXBvcnQgeyBlcnJvck1lc3NhZ2UsIGdldFN0c0NsaWVudCwgaXNEZWZpbmVkIH0gZnJvbSAnLi9oZWxwZXJzJztcblxuY29uc3QgU0FOSVRJWkFUSU9OX0NIQVJBQ1RFUiA9ICdfJztcbmNvbnN0IE1BWF9UQUdfVkFMVUVfTEVOR1RIID0gMjU2O1xuXG5mdW5jdGlvbiBzYW5pdGl6ZUdpdGh1YkFjdG9yKGFjdG9yOiBzdHJpbmcpIHtcbiAgLy8gSW4gc29tZSBjaXJjdW1zdGFuY2VzIHRoZSBhY3RvciBtYXkgY29udGFpbiBzcXVhcmUgYnJhY2tldHMuIEZvciBleGFtcGxlLCBpZiB0aGV5J3JlIGEgYm90ICgnW2JvdF0nKVxuICAvLyBTcXVhcmUgYnJhY2tldHMgYXJlIG5vdCBhbGxvd2VkIGluIEFXUyBzZXNzaW9uIHRhZ3NcbiAgcmV0dXJuIGFjdG9yLnJlcGxhY2UoL1xcW3xcXF0vZywgU0FOSVRJWkFUSU9OX0NIQVJBQ1RFUik7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplR2l0aHViV29ya2Zsb3dOYW1lKG5hbWU6IHN0cmluZykge1xuICAvLyBXb3JrZmxvdyBuYW1lcyBjYW4gYmUgYWxtb3N0IGFueSB2YWxpZCBVVEYtOCBzdHJpbmcsIGJ1dCB0YWdzIGFyZSBtb3JlIHJlc3RyaWN0aXZlLlxuICAvLyBUaGlzIHJlcGxhY2VzIGFueXRoaW5nIG5vdCBjb25mb3JtaW5nIHRvIHRoZSB0YWcgcmVzdHJpY3Rpb25zIGJ5IGludmVydGluZyB0aGUgcmVndWxhciBleHByZXNzaW9uLlxuICAvLyBTZWUgdGhlIEFXUyBkb2N1bWVudGF0aW9uIGZvciBjb25zdHJhaW50IHNwZWNpZmljcyBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vU1RTL2xhdGVzdC9BUElSZWZlcmVuY2UvQVBJX1RhZy5odG1sLlxuICBjb25zdCBuYW1lV2l0aG91dFNwZWNpYWxDaGFyYWN0ZXJzID0gbmFtZS5yZXBsYWNlKC9bXlxccHtMfVxccHtafVxccHtOfV86Lz0rLi1ALV0vZ3UsIFNBTklUSVpBVElPTl9DSEFSQUNURVIpO1xuICBjb25zdCBuYW1lVHJ1bmNhdGVkID0gbmFtZVdpdGhvdXRTcGVjaWFsQ2hhcmFjdGVycy5zbGljZSgwLCBNQVhfVEFHX1ZBTFVFX0xFTkdUSCk7XG4gIHJldHVybiBuYW1lVHJ1bmNhdGVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIGFzc3VtZVJvbGVQYXJhbXMge1xuICByZWdpb246IHN0cmluZztcbiAgcm9sZVRvQXNzdW1lOiBzdHJpbmc7XG4gIHJvbGVEdXJhdGlvblNlY29uZHM6IG51bWJlcjtcbiAgcm9sZVNlc3Npb25OYW1lOiBzdHJpbmc7XG4gIHJvbGVTa2lwU2Vzc2lvblRhZ2dpbmc/OiBib29sZWFuO1xuICBzb3VyY2VBY2NvdW50SWQ/OiBzdHJpbmc7XG4gIHJvbGVFeHRlcm5hbElkPzogc3RyaW5nO1xuICB3ZWJJZGVudGl0eVRva2VuRmlsZT86IHN0cmluZztcbiAgd2ViSWRlbnRpdHlUb2tlbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFzc3VtZVJvbGUocGFyYW1zOiBhc3N1bWVSb2xlUGFyYW1zKSB7XG4gIC8vIEFzc3VtZSBhIHJvbGUgdG8gZ2V0IHNob3J0LWxpdmVkIGNyZWRlbnRpYWxzIHVzaW5nIGxvbmdlci1saXZlZCBjcmVkZW50aWFscy5cbiAgY29uc3Qge1xuICAgIHNvdXJjZUFjY291bnRJZCxcbiAgICByb2xlVG9Bc3N1bWUsXG4gICAgcm9sZUV4dGVybmFsSWQsXG4gICAgcm9sZUR1cmF0aW9uU2Vjb25kcyxcbiAgICByb2xlU2Vzc2lvbk5hbWUsXG4gICAgcmVnaW9uLFxuICAgIHJvbGVTa2lwU2Vzc2lvblRhZ2dpbmcsXG4gICAgd2ViSWRlbnRpdHlUb2tlbkZpbGUsXG4gICAgd2ViSWRlbnRpdHlUb2tlbixcbiAgfSA9IHsgLi4ucGFyYW1zIH07XG5cbiAgY29uc3QgeyBHSVRIVUJfUkVQT1NJVE9SWSwgR0lUSFVCX1dPUktGTE9XLCBHSVRIVUJfQUNUSU9OLCBHSVRIVUJfQUNUT1IsIEdJVEhVQl9TSEEsIEdJVEhVQl9XT1JLU1BBQ0UgfSA9IHByb2Nlc3MuZW52O1xuICBpZiAoIUdJVEhVQl9SRVBPU0lUT1JZIHx8ICFHSVRIVUJfV09SS0ZMT1cgfHwgIUdJVEhVQl9BQ1RJT04gfHwgIUdJVEhVQl9BQ1RPUiB8fCAhR0lUSFVCX1NIQSB8fCAhR0lUSFVCX1dPUktTUEFDRSkge1xuICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyByZXF1aXJlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMuIEFyZSB5b3UgcnVubmluZyBpbiBHaXRIdWIgQWN0aW9ucz8nKTtcbiAgfVxuXG4gIGxldCBSb2xlQXJuID0gcm9sZVRvQXNzdW1lO1xuICBpZiAoIVJvbGVBcm4uc3RhcnRzV2l0aCgnYXJuOmF3cycpKSB7XG4gICAgLy8gU3VwcG9ydHMgb25seSAnYXdzJyBwYXJ0aXRpb24uIEN1c3RvbWVycyBpbiBvdGhlciBwYXJ0aXRpb25zICgnYXdzLWNuJykgd2lsbCBuZWVkIHRvIHByb3ZpZGUgZnVsbCBBUk5cbiAgICBhc3NlcnQoXG4gICAgICBpc0RlZmluZWQoc291cmNlQWNjb3VudElkKSxcbiAgICAgICdTb3VyY2UgQWNjb3VudCBJRCBpcyBuZWVkZWQgaWYgdGhlIFJvbGUgTmFtZSBpcyBwcm92aWRlZCBhbmQgbm90IHRoZSBSb2xlIEFybi4nXG4gICAgKTtcbiAgICBSb2xlQXJuID0gYGFybjphd3M6aWFtOjoke3NvdXJjZUFjY291bnRJZH06cm9sZS8ke1JvbGVBcm59YDtcbiAgfVxuXG4gIGNvbnN0IHRhZ0FycmF5ID0gW1xuICAgIHsgS2V5OiAnR2l0SHViJywgVmFsdWU6ICdBY3Rpb25zJyB9LFxuICAgIHsgS2V5OiAnUmVwb3NpdG9yeScsIFZhbHVlOiBHSVRIVUJfUkVQT1NJVE9SWSB9LFxuICAgIHsgS2V5OiAnV29ya2Zsb3cnLCBWYWx1ZTogc2FuaXRpemVHaXRodWJXb3JrZmxvd05hbWUoR0lUSFVCX1dPUktGTE9XKSB9LFxuICAgIHsgS2V5OiAnQWN0aW9uJywgVmFsdWU6IEdJVEhVQl9BQ1RJT04gfSxcbiAgICB7IEtleTogJ0FjdG9yJywgVmFsdWU6IHNhbml0aXplR2l0aHViQWN0b3IoR0lUSFVCX0FDVE9SKSB9LFxuICAgIHsgS2V5OiAnQ29tbWl0JywgVmFsdWU6IEdJVEhVQl9TSEEgfSxcbiAgXTtcblxuICBpZiAocHJvY2Vzcy5lbnYuR0lUSFVCX1JFRikge1xuICAgIHRhZ0FycmF5LnB1c2goeyBLZXk6ICdCcmFuY2gnLCBWYWx1ZTogcHJvY2Vzcy5lbnYuR0lUSFVCX1JFRiB9KTtcbiAgfVxuXG4gIGNvbnN0IFRhZ3MgPSByb2xlU2tpcFNlc3Npb25UYWdnaW5nID8gdW5kZWZpbmVkIDogdGFnQXJyYXk7XG4gIGlmICghVGFncykge1xuICAgIGNvcmUuZGVidWcoJ1JvbGUgc2Vzc2lvbiB0YWdnaW5nIGhhcyBiZWVuIHNraXBwZWQuJyk7XG4gIH0gZWxzZSB7XG4gICAgY29yZS5kZWJ1ZyhUYWdzLmxlbmd0aCArICcgcm9sZSBzZXNzaW9uIHRhZ3MgYXJlIGJlaW5nIHVzZWQuJyk7XG4gIH1cblxuICBjb25zdCBjb21tb25Bc3N1bWVSb2xlUGFyYW1zOiBBc3N1bWVSb2xlQ29tbWFuZElucHV0ID0ge1xuICAgIFJvbGVBcm4sXG4gICAgUm9sZVNlc3Npb25OYW1lOiByb2xlU2Vzc2lvbk5hbWUsXG4gICAgRHVyYXRpb25TZWNvbmRzOiByb2xlRHVyYXRpb25TZWNvbmRzLFxuICAgIFRhZ3MsXG4gICAgRXh0ZXJuYWxJZDogcm9sZUV4dGVybmFsSWQsXG4gIH07XG4gIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhjb21tb25Bc3N1bWVSb2xlUGFyYW1zKSBhcyBBcnJheTxrZXlvZiB0eXBlb2YgY29tbW9uQXNzdW1lUm9sZVBhcmFtcz47XG4gIGtleXMuZm9yRWFjaCgoaykgPT4gY29tbW9uQXNzdW1lUm9sZVBhcmFtc1trXSA9PT0gdW5kZWZpbmVkICYmIGRlbGV0ZSBjb21tb25Bc3N1bWVSb2xlUGFyYW1zW2tdKTtcblxuICBsZXQgYXNzdW1lUm9sZUNvbW1hbmQ6IEFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlDb21tYW5kO1xuICBzd2l0Y2ggKHRydWUpIHtcbiAgICBjYXNlICEhd2ViSWRlbnRpdHlUb2tlbjoge1xuICAgICAgZGVsZXRlIGNvbW1vbkFzc3VtZVJvbGVQYXJhbXMuVGFncztcbiAgICAgIGFzc3VtZVJvbGVDb21tYW5kID0gbmV3IEFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlDb21tYW5kKHtcbiAgICAgICAgLi4uY29tbW9uQXNzdW1lUm9sZVBhcmFtcyxcbiAgICAgICAgV2ViSWRlbnRpdHlUb2tlbjogd2ViSWRlbnRpdHlUb2tlbixcbiAgICAgIH0pO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgISF3ZWJJZGVudGl0eVRva2VuRmlsZToge1xuICAgICAgY29yZS5kZWJ1ZyhcbiAgICAgICAgJ3dlYklkZW50aXR5VG9rZW5GaWxlIHByb3ZpZGVkLiBXaWxsIGNhbGwgc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHkgYW5kIHRha2Ugc2Vzc2lvbiB0YWdzIGZyb20gdG9rZW4gY29udGVudHMuJ1xuICAgICAgKTtcblxuICAgICAgY29uc3Qgd2ViSWRlbnRpdHlUb2tlbkZpbGVQYXRoID0gcGF0aC5pc0Fic29sdXRlKHdlYklkZW50aXR5VG9rZW5GaWxlISlcbiAgICAgICAgPyB3ZWJJZGVudGl0eVRva2VuRmlsZSFcbiAgICAgICAgOiBwYXRoLmpvaW4oR0lUSFVCX1dPUktTUEFDRSwgd2ViSWRlbnRpdHlUb2tlbkZpbGUhKTtcbiAgICAgIGlmICghZnMuZXhpc3RzU3luYyh3ZWJJZGVudGl0eVRva2VuRmlsZVBhdGgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgV2ViIGlkZW50aXR5IHRva2VuIGZpbGUgZG9lcyBub3QgZXhpc3Q6ICR7d2ViSWRlbnRpdHlUb2tlbkZpbGVQYXRofWApO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3aWR0ID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUod2ViSWRlbnRpdHlUb2tlbkZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICBkZWxldGUgY29tbW9uQXNzdW1lUm9sZVBhcmFtcy5UYWdzO1xuICAgICAgICBhc3N1bWVSb2xlQ29tbWFuZCA9IG5ldyBBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5Q29tbWFuZCh7XG4gICAgICAgICAgLi4uY29tbW9uQXNzdW1lUm9sZVBhcmFtcyxcbiAgICAgICAgICBXZWJJZGVudGl0eVRva2VuOiB3aWR0LFxuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgV2ViIGlkZW50aXR5IHRva2VuIGZpbGUgY291bGQgbm90IGJlIHJlYWQ6ICR7ZXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcbiAgICAgIH1cbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyB3ZWIgaWRlbnRpdHkgdG9rZW4gb3Igd2ViIGlkZW50aXR5IHRva2VuIGZpbGUgcHJvdmlkZWQuJyk7XG4gIH1cblxuICBjb25zdCBzdHMgPSBnZXRTdHNDbGllbnQocmVnaW9uKTtcbiAgcmV0dXJuIHN0cy5zZW5kKGFzc3VtZVJvbGVDb21tYW5kKTtcbn1cbiJdfQ==