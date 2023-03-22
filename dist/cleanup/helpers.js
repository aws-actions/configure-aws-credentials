"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.isDefined = exports.errorMessage = exports.retryAndBackoff = exports.reset = exports.withsleep = exports.defaultSleep = exports.sanitizeGitHubVariables = exports.exportAccountId = exports.exportRegion = exports.exportCredentials = void 0;
var core = require("@actions/core");
var client_sts_1 = require("@aws-sdk/client-sts");
var MAX_TAG_VALUE_LENGTH = 256;
var SANITIZATION_CHARACTER = '_';
// Configure the AWS CLI and AWS SDKs using environment variables and set them as secrets.
// Setting the credentials as secrets masks them in Github Actions logs
function exportCredentials(creds) {
    if (creds === null || creds === void 0 ? void 0 : creds.AccessKeyId) {
        core.setSecret(creds.AccessKeyId);
        core.exportVariable('AWS_ACCESS_KEY_ID', creds.AccessKeyId);
    }
    if (creds === null || creds === void 0 ? void 0 : creds.SecretAccessKey) {
        core.setSecret(creds.SecretAccessKey);
        core.exportVariable('AWS_SECRET_ACCESS_KEY', creds.SecretAccessKey);
    }
    if (creds === null || creds === void 0 ? void 0 : creds.SessionToken) {
        core.setSecret(creds.SessionToken);
        core.exportVariable('AWS_SESSION_TOKEN', creds.SessionToken);
    }
    else if (process.env['AWS_SESSION_TOKEN']) {
        // clear session token from previous credentials action
        core.exportVariable('AWS_SESSION_TOKEN', '');
    }
}
exports.exportCredentials = exportCredentials;
function exportRegion(region) {
    core.exportVariable('AWS_DEFAULT_REGION', region);
    core.exportVariable('AWS_REGION', region);
}
exports.exportRegion = exportRegion;
// Obtains account ID from STS Client and sets it as output
function exportAccountId(credentialsClient, maskAccountId) {
    return __awaiter(this, void 0, void 0, function () {
        var client, identity, accountId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    client = credentialsClient.getStsClient();
                    return [4 /*yield*/, client.send(new client_sts_1.GetCallerIdentityCommand({}))];
                case 1:
                    identity = _a.sent();
                    accountId = identity.Account;
                    if (!accountId) {
                        throw new Error('Could not get Account ID from STS. Did you set credentials?');
                    }
                    if (maskAccountId) {
                        core.setSecret(accountId);
                    }
                    core.setOutput('aws-account-id', accountId);
                    return [2 /*return*/, accountId];
            }
        });
    });
}
exports.exportAccountId = exportAccountId;
// Tags have a more restrictive set of acceptable characters than GitHub environment variables can.
// This replaces anything not conforming to the tag restrictions by inverting the regular expression.
// See the AWS documentation for constraint specifics https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html.
function sanitizeGitHubVariables(name) {
    var nameWithoutSpecialCharacters = name.replace(/[^\p{L}\p{Z}\p{N}_.:/=+\-@]/gu, SANITIZATION_CHARACTER);
    var nameTruncated = nameWithoutSpecialCharacters.slice(0, MAX_TAG_VALUE_LENGTH);
    return nameTruncated;
}
exports.sanitizeGitHubVariables = sanitizeGitHubVariables;
function defaultSleep(ms) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
        });
    });
}
exports.defaultSleep = defaultSleep;
var sleep = defaultSleep;
function withsleep(s) {
    sleep = s;
}
exports.withsleep = withsleep;
function reset() {
    sleep = defaultSleep;
}
exports.reset = reset;
// Retries the promise with exponential backoff if the error isRetryable up to maxRetries time.
function retryAndBackoff(fn, isRetryable, retries, maxRetries, base) {
    if (retries === void 0) { retries = 0; }
    if (maxRetries === void 0) { maxRetries = 12; }
    if (base === void 0) { base = 50; }
    return __awaiter(this, void 0, void 0, function () {
        var err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 5]);
                    return [4 /*yield*/, fn()];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    err_1 = _a.sent();
                    if (!isRetryable) {
                        throw err_1;
                    }
                    // It's retryable, so sleep and retry.
                    return [4 /*yield*/, sleep(Math.random() * (Math.pow(2, retries) * base))];
                case 3:
                    // It's retryable, so sleep and retry.
                    _a.sent();
                    retries += 1;
                    if (retries === maxRetries) {
                        throw err_1;
                    }
                    return [4 /*yield*/, retryAndBackoff(fn, isRetryable, retries, maxRetries, base)];
                case 4: return [2 /*return*/, _a.sent()];
                case 5: return [2 /*return*/];
            }
        });
    });
}
exports.retryAndBackoff = retryAndBackoff;
/* c8 ignore start */
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
exports.errorMessage = errorMessage;
function isDefined(i) {
    return i !== undefined && i !== null;
}
exports.isDefined = isDefined;
/* c8 ignore stop */
