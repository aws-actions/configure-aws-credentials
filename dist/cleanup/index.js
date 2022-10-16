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
exports.cleanup = void 0;
const core = __importStar(require("@actions/core"));
const helpers_1 = require("../helpers");
/**
 * When the GitHub Actions job is done, clean up any environment variables that
 * may have been set by the configure-aws-credentials steps in the job.
 *
 * Environment variables are not intended to be shared across different jobs in
 * the same GitHub Actions workflow: GitHub Actions documentation states that
 * each job runs in a fresh instance.  However, doing our own cleanup will
 * give us additional assurance that these environment variables are not shared
 * with any other jobs.
 */
async function cleanup() {
    try {
        // The GitHub Actions toolkit does not have an option to completely unset
        // environment variables, so we overwrite the current value with an empty
        // string. The AWS CLI and AWS SDKs will behave correctly: they treat an
        // empty string value as if the environment variable does not exist.
        core.exportVariable('AWS_ACCESS_KEY_ID', '');
        core.exportVariable('AWS_SECRET_ACCESS_KEY', '');
        core.exportVariable('AWS_SESSION_TOKEN', '');
        core.exportVariable('AWS_DEFAULT_REGION', '');
        core.exportVariable('AWS_REGION', '');
    }
    catch (error) {
        core.setFailed((0, helpers_1.errorMessage)(error));
    }
}
exports.cleanup = cleanup;
if (require.main === module) {
    (async () => {
        await cleanup();
    })().catch((error) => {
        core.setFailed((0, helpers_1.errorMessage)(error));
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY2xlYW51cC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLG9EQUFzQztBQUN0Qyx3Q0FBMEM7QUFFMUM7Ozs7Ozs7OztHQVNHO0FBRUksS0FBSyxVQUFVLE9BQU87SUFDM0IsSUFBSTtRQUNGLHlFQUF5RTtRQUN6RSx5RUFBeUU7UUFDekUsd0VBQXdFO1FBQ3hFLG9FQUFvRTtRQUNwRSxJQUFJLENBQUMsY0FBYyxDQUFDLG1CQUFtQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxjQUFjLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsY0FBYyxDQUFDLG9CQUFvQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLElBQUksQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0tBQ3ZDO0lBQUMsT0FBTyxLQUFLLEVBQUU7UUFDZCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUEsc0JBQVksRUFBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0tBQ3JDO0FBQ0gsQ0FBQztBQWRELDBCQWNDO0FBQ0QsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRTtJQUMzQixDQUFDLEtBQUssSUFBSSxFQUFFO1FBQ1YsTUFBTSxPQUFPLEVBQUUsQ0FBQztJQUNsQixDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO1FBQ25CLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBQSxzQkFBWSxFQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDdEMsQ0FBQyxDQUFDLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNvcmUgZnJvbSAnQGFjdGlvbnMvY29yZSc7XG5pbXBvcnQgeyBlcnJvck1lc3NhZ2UgfSBmcm9tICcuLi9oZWxwZXJzJztcblxuLyoqXG4gKiBXaGVuIHRoZSBHaXRIdWIgQWN0aW9ucyBqb2IgaXMgZG9uZSwgY2xlYW4gdXAgYW55IGVudmlyb25tZW50IHZhcmlhYmxlcyB0aGF0XG4gKiBtYXkgaGF2ZSBiZWVuIHNldCBieSB0aGUgY29uZmlndXJlLWF3cy1jcmVkZW50aWFscyBzdGVwcyBpbiB0aGUgam9iLlxuICpcbiAqIEVudmlyb25tZW50IHZhcmlhYmxlcyBhcmUgbm90IGludGVuZGVkIHRvIGJlIHNoYXJlZCBhY3Jvc3MgZGlmZmVyZW50IGpvYnMgaW5cbiAqIHRoZSBzYW1lIEdpdEh1YiBBY3Rpb25zIHdvcmtmbG93OiBHaXRIdWIgQWN0aW9ucyBkb2N1bWVudGF0aW9uIHN0YXRlcyB0aGF0XG4gKiBlYWNoIGpvYiBydW5zIGluIGEgZnJlc2ggaW5zdGFuY2UuICBIb3dldmVyLCBkb2luZyBvdXIgb3duIGNsZWFudXAgd2lsbFxuICogZ2l2ZSB1cyBhZGRpdGlvbmFsIGFzc3VyYW5jZSB0aGF0IHRoZXNlIGVudmlyb25tZW50IHZhcmlhYmxlcyBhcmUgbm90IHNoYXJlZFxuICogd2l0aCBhbnkgb3RoZXIgam9icy5cbiAqL1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2xlYW51cCgpIHtcbiAgdHJ5IHtcbiAgICAvLyBUaGUgR2l0SHViIEFjdGlvbnMgdG9vbGtpdCBkb2VzIG5vdCBoYXZlIGFuIG9wdGlvbiB0byBjb21wbGV0ZWx5IHVuc2V0XG4gICAgLy8gZW52aXJvbm1lbnQgdmFyaWFibGVzLCBzbyB3ZSBvdmVyd3JpdGUgdGhlIGN1cnJlbnQgdmFsdWUgd2l0aCBhbiBlbXB0eVxuICAgIC8vIHN0cmluZy4gVGhlIEFXUyBDTEkgYW5kIEFXUyBTREtzIHdpbGwgYmVoYXZlIGNvcnJlY3RseTogdGhleSB0cmVhdCBhblxuICAgIC8vIGVtcHR5IHN0cmluZyB2YWx1ZSBhcyBpZiB0aGUgZW52aXJvbm1lbnQgdmFyaWFibGUgZG9lcyBub3QgZXhpc3QuXG4gICAgY29yZS5leHBvcnRWYXJpYWJsZSgnQVdTX0FDQ0VTU19LRVlfSUQnLCAnJyk7XG4gICAgY29yZS5leHBvcnRWYXJpYWJsZSgnQVdTX1NFQ1JFVF9BQ0NFU1NfS0VZJywgJycpO1xuICAgIGNvcmUuZXhwb3J0VmFyaWFibGUoJ0FXU19TRVNTSU9OX1RPS0VOJywgJycpO1xuICAgIGNvcmUuZXhwb3J0VmFyaWFibGUoJ0FXU19ERUZBVUxUX1JFR0lPTicsICcnKTtcbiAgICBjb3JlLmV4cG9ydFZhcmlhYmxlKCdBV1NfUkVHSU9OJywgJycpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvcmUuc2V0RmFpbGVkKGVycm9yTWVzc2FnZShlcnJvcikpO1xuICB9XG59XG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgKGFzeW5jICgpID0+IHtcbiAgICBhd2FpdCBjbGVhbnVwKCk7XG4gIH0pKCkuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgY29yZS5zZXRGYWlsZWQoZXJyb3JNZXNzYWdlKGVycm9yKSk7XG4gIH0pO1xufVxuIl19