import * as core from '@actions/core';
import { errorMessage } from '../helpers.js';
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
export async function cleanup() {
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
        core.setFailed(errorMessage(error));
    }
}
if (require.main === module) {
    await cleanup();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY2xlYW51cC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUssSUFBSSxNQUFNLGVBQWUsQ0FBQztBQUN0QyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRTdDOzs7Ozs7Ozs7R0FTRztBQUVILE1BQU0sQ0FBQyxLQUFLLFVBQVUsT0FBTztJQUMzQixJQUFJO1FBQ0YseUVBQXlFO1FBQ3pFLHlFQUF5RTtRQUN6RSx3RUFBd0U7UUFDeEUsb0VBQW9FO1FBQ3BFLElBQUksQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsY0FBYyxDQUFDLG1CQUFtQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDOUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLENBQUM7S0FDdkM7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7S0FDckM7QUFDSCxDQUFDO0FBRUQsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRTtJQUMzQixNQUFNLE9BQU8sRUFBRSxDQUFDO0NBQ2pCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY29yZSBmcm9tICdAYWN0aW9ucy9jb3JlJztcbmltcG9ydCB7IGVycm9yTWVzc2FnZSB9IGZyb20gJy4uL2hlbHBlcnMuanMnO1xuXG4vKipcbiAqIFdoZW4gdGhlIEdpdEh1YiBBY3Rpb25zIGpvYiBpcyBkb25lLCBjbGVhbiB1cCBhbnkgZW52aXJvbm1lbnQgdmFyaWFibGVzIHRoYXRcbiAqIG1heSBoYXZlIGJlZW4gc2V0IGJ5IHRoZSBjb25maWd1cmUtYXdzLWNyZWRlbnRpYWxzIHN0ZXBzIGluIHRoZSBqb2IuXG4gKlxuICogRW52aXJvbm1lbnQgdmFyaWFibGVzIGFyZSBub3QgaW50ZW5kZWQgdG8gYmUgc2hhcmVkIGFjcm9zcyBkaWZmZXJlbnQgam9icyBpblxuICogdGhlIHNhbWUgR2l0SHViIEFjdGlvbnMgd29ya2Zsb3c6IEdpdEh1YiBBY3Rpb25zIGRvY3VtZW50YXRpb24gc3RhdGVzIHRoYXRcbiAqIGVhY2ggam9iIHJ1bnMgaW4gYSBmcmVzaCBpbnN0YW5jZS4gIEhvd2V2ZXIsIGRvaW5nIG91ciBvd24gY2xlYW51cCB3aWxsXG4gKiBnaXZlIHVzIGFkZGl0aW9uYWwgYXNzdXJhbmNlIHRoYXQgdGhlc2UgZW52aXJvbm1lbnQgdmFyaWFibGVzIGFyZSBub3Qgc2hhcmVkXG4gKiB3aXRoIGFueSBvdGhlciBqb2JzLlxuICovXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjbGVhbnVwKCkge1xuICB0cnkge1xuICAgIC8vIFRoZSBHaXRIdWIgQWN0aW9ucyB0b29sa2l0IGRvZXMgbm90IGhhdmUgYW4gb3B0aW9uIHRvIGNvbXBsZXRlbHkgdW5zZXRcbiAgICAvLyBlbnZpcm9ubWVudCB2YXJpYWJsZXMsIHNvIHdlIG92ZXJ3cml0ZSB0aGUgY3VycmVudCB2YWx1ZSB3aXRoIGFuIGVtcHR5XG4gICAgLy8gc3RyaW5nLiBUaGUgQVdTIENMSSBhbmQgQVdTIFNES3Mgd2lsbCBiZWhhdmUgY29ycmVjdGx5OiB0aGV5IHRyZWF0IGFuXG4gICAgLy8gZW1wdHkgc3RyaW5nIHZhbHVlIGFzIGlmIHRoZSBlbnZpcm9ubWVudCB2YXJpYWJsZSBkb2VzIG5vdCBleGlzdC5cbiAgICBjb3JlLmV4cG9ydFZhcmlhYmxlKCdBV1NfQUNDRVNTX0tFWV9JRCcsICcnKTtcbiAgICBjb3JlLmV4cG9ydFZhcmlhYmxlKCdBV1NfU0VDUkVUX0FDQ0VTU19LRVknLCAnJyk7XG4gICAgY29yZS5leHBvcnRWYXJpYWJsZSgnQVdTX1NFU1NJT05fVE9LRU4nLCAnJyk7XG4gICAgY29yZS5leHBvcnRWYXJpYWJsZSgnQVdTX0RFRkFVTFRfUkVHSU9OJywgJycpO1xuICAgIGNvcmUuZXhwb3J0VmFyaWFibGUoJ0FXU19SRUdJT04nLCAnJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29yZS5zZXRGYWlsZWQoZXJyb3JNZXNzYWdlKGVycm9yKSk7XG4gIH1cbn1cblxuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XG4gIGF3YWl0IGNsZWFudXAoKTtcbn1cbiJdfQ==