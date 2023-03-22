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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
exports.__esModule = true;
exports.CredentialsClient = void 0;
var core = __importStar(require("@actions/core"));
var client_sts_1 = require("@aws-sdk/client-sts");
var node_http_handler_1 = require("@aws-sdk/node-http-handler");
var https_proxy_agent_1 = __importDefault(require("https-proxy-agent"));
var helpers_1 = require("./helpers");
var USER_AGENT = 'configure-aws-credentials-for-github-actions';
var CredentialsClient = /** @class */ (function () {
    function CredentialsClient(props) {
        if (props.region) {
            this.region = props.region;
        }
        else {
            core.info('No region provided, using global STS endpoint');
        }
        if (props.proxyServer) {
            core.info('Configurint proxy handler for STS client');
            var handler = (0, https_proxy_agent_1["default"])(props.proxyServer);
            this.requestHandler = new node_http_handler_1.NodeHttpHandler({
                httpAgent: handler,
                httpsAgent: handler
            });
        }
    }
    CredentialsClient.prototype.getStsClient = function () {
        if (!this.stsClient) {
            this.stsClient = new client_sts_1.STSClient({
                region: this.region ? this.region : undefined,
                customUserAgent: USER_AGENT,
                requestHandler: this.requestHandler ? this.requestHandler : undefined,
                useGlobalEndpoint: this.region ? false : true
            });
        }
        return this.stsClient;
    };
    CredentialsClient.prototype.validateCredentials = function (expectedAccessKeyId) {
        return __awaiter(this, void 0, void 0, function () {
            var credentials, error_1, actualAccessKeyId;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.loadCredentials()];
                    case 1:
                        credentials = _a.sent();
                        if (!credentials.accessKeyId) {
                            throw new Error('Access key ID empty after loading credentials');
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        throw new Error("Credentials could not be loaded, please check your action inputs: ".concat((0, helpers_1.errorMessage)(error_1)));
                    case 3:
                        actualAccessKeyId = credentials.accessKeyId;
                        if (expectedAccessKeyId && expectedAccessKeyId !== actualAccessKeyId) {
                            throw new Error('Unexpected failure: Credentials loaded by the SDK do not match the access key ID configured by the action');
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    CredentialsClient.prototype.loadCredentials = function () {
        return __awaiter(this, void 0, void 0, function () {
            var client;
            return __generator(this, function (_a) {
                client = new client_sts_1.STSClient({
                    requestHandler: this.requestHandler ? this.requestHandler : undefined
                });
                return [2 /*return*/, client.config.credentials()];
            });
        });
    };
    return CredentialsClient;
}());
exports.CredentialsClient = CredentialsClient;
