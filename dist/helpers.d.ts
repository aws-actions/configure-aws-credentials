import { STSClient } from '@aws-sdk/client-sts';
export declare function getStsClient(region: string, agent?: string): STSClient;
export declare function sanitizeGithubActor(actor: string): string;
export declare function sanitizeGithubWorkflowName(name: string): string;
export declare function errorMessage(error: unknown): string;
export declare function isDefined<T>(i: T | undefined | null): i is T;
export declare function retryAndBackoff<T>(fn: () => Promise<T>, isRetryable: boolean, retries?: number, maxRetries?: number, base?: number): Promise<T>;
