"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryAndBackoff = exports.isDefined = exports.errorMessage = exports.sanitizeGithubWorkflowName = exports.sanitizeGithubActor = exports.getStsClient = void 0;
const client_sts_1 = require("@aws-sdk/client-sts");
const MAX_TAG_VALUE_LENGTH = 256;
const SANITIZATION_CHARACTER = '_';
let stsclient;
function getStsClient(region, agent) {
    if (!stsclient) {
        stsclient = new client_sts_1.STSClient({
            region,
            customUserAgent: agent,
        });
    }
    return stsclient;
}
exports.getStsClient = getStsClient;
function sanitizeGithubActor(actor) {
    // In some circumstances the actor may contain square brackets. For example, if they're a bot ('[bot]')
    // Square brackets are not allowed in AWS session tags
    return actor.replace(/\[|\]/g, SANITIZATION_CHARACTER);
}
exports.sanitizeGithubActor = sanitizeGithubActor;
function sanitizeGithubWorkflowName(name) {
    // Workflow names can be almost any valid UTF-8 string, but tags are more restrictive.
    // This replaces anything not conforming to the tag restrictions by inverting the regular expression.
    // See the AWS documentation for constraint specifics https://docs.aws.amazon.com/STS/latest/APIReference/API_Tag.html.
    const nameWithoutSpecialCharacters = name.replace(/[^\p{L}\p{Z}\p{N}_:/=+.-@-]/gu, SANITIZATION_CHARACTER);
    const nameTruncated = nameWithoutSpecialCharacters.slice(0, MAX_TAG_VALUE_LENGTH);
    return nameTruncated;
}
exports.sanitizeGithubWorkflowName = sanitizeGithubWorkflowName;
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
exports.errorMessage = errorMessage;
function isDefined(i) {
    return i !== undefined && i !== null;
}
exports.isDefined = isDefined;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// retryAndBackoff retries with exponential backoff the promise if the error isRetryable upto maxRetries time.
async function retryAndBackoff(fn, isRetryable, retries = 0, maxRetries = 12, base = 50) {
    try {
        return await fn();
    }
    catch (err) {
        if (!isRetryable) {
            throw err;
        }
        // It's retryable, so sleep and retry.
        await sleep(Math.random() * (Math.pow(2, retries) * base));
        retries += 1;
        if (retries === maxRetries) {
            throw err;
        }
        return await retryAndBackoff(fn, isRetryable, retries, maxRetries, base);
    }
}
exports.retryAndBackoff = retryAndBackoff;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9oZWxwZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG9EQUFnRDtBQUVoRCxNQUFNLG9CQUFvQixHQUFHLEdBQUcsQ0FBQztBQUNqQyxNQUFNLHNCQUFzQixHQUFHLEdBQUcsQ0FBQztBQUVuQyxJQUFJLFNBQWdDLENBQUM7QUFFckMsU0FBZ0IsWUFBWSxDQUFDLE1BQWMsRUFBRSxLQUFjO0lBQ3pELElBQUksQ0FBQyxTQUFTLEVBQUU7UUFDZCxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDO1lBQ3hCLE1BQU07WUFDTixlQUFlLEVBQUUsS0FBSztTQUN2QixDQUFDLENBQUM7S0FDSjtJQUNELE9BQU8sU0FBUyxDQUFDO0FBQ25CLENBQUM7QUFSRCxvQ0FRQztBQUVELFNBQWdCLG1CQUFtQixDQUFDLEtBQWE7SUFDL0MsdUdBQXVHO0lBQ3ZHLHNEQUFzRDtJQUN0RCxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLHNCQUFzQixDQUFDLENBQUM7QUFDekQsQ0FBQztBQUpELGtEQUlDO0FBRUQsU0FBZ0IsMEJBQTBCLENBQUMsSUFBWTtJQUNyRCxzRkFBc0Y7SUFDdEYscUdBQXFHO0lBQ3JHLHVIQUF1SDtJQUN2SCxNQUFNLDRCQUE0QixHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsK0JBQStCLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztJQUMzRyxNQUFNLGFBQWEsR0FBRyw0QkFBNEIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDbEYsT0FBTyxhQUFhLENBQUM7QUFDdkIsQ0FBQztBQVBELGdFQU9DO0FBRUQsU0FBZ0IsWUFBWSxDQUFDLEtBQWM7SUFDekMsT0FBTyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDaEUsQ0FBQztBQUZELG9DQUVDO0FBRUQsU0FBZ0IsU0FBUyxDQUFJLENBQXVCO0lBQ2xELE9BQU8sQ0FBQyxLQUFLLFNBQVMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDO0FBQ3ZDLENBQUM7QUFGRCw4QkFFQztBQUVELFNBQVMsS0FBSyxDQUFDLEVBQVU7SUFDdkIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQzNELENBQUM7QUFFRCw4R0FBOEc7QUFDdkcsS0FBSyxVQUFVLGVBQWUsQ0FDbkMsRUFBb0IsRUFDcEIsV0FBb0IsRUFDcEIsT0FBTyxHQUFHLENBQUMsRUFDWCxVQUFVLEdBQUcsRUFBRSxFQUNmLElBQUksR0FBRyxFQUFFO0lBRVQsSUFBSTtRQUNGLE9BQU8sTUFBTSxFQUFFLEVBQUUsQ0FBQztLQUNuQjtJQUFDLE9BQU8sR0FBRyxFQUFFO1FBQ1osSUFBSSxDQUFDLFdBQVcsRUFBRTtZQUNoQixNQUFNLEdBQUcsQ0FBQztTQUNYO1FBQ0Qsc0NBQXNDO1FBQ3RDLE1BQU0sS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDM0QsT0FBTyxJQUFJLENBQUMsQ0FBQztRQUNiLElBQUksT0FBTyxLQUFLLFVBQVUsRUFBRTtZQUMxQixNQUFNLEdBQUcsQ0FBQztTQUNYO1FBQ0QsT0FBTyxNQUFNLGVBQWUsQ0FBQyxFQUFFLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7S0FDMUU7QUFDSCxDQUFDO0FBckJELDBDQXFCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNUU0NsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zdHMnO1xuXG5jb25zdCBNQVhfVEFHX1ZBTFVFX0xFTkdUSCA9IDI1NjtcbmNvbnN0IFNBTklUSVpBVElPTl9DSEFSQUNURVIgPSAnXyc7XG5cbmxldCBzdHNjbGllbnQ6IFNUU0NsaWVudCB8IHVuZGVmaW5lZDtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN0c0NsaWVudChyZWdpb246IHN0cmluZywgYWdlbnQ/OiBzdHJpbmcpIHtcbiAgaWYgKCFzdHNjbGllbnQpIHtcbiAgICBzdHNjbGllbnQgPSBuZXcgU1RTQ2xpZW50KHtcbiAgICAgIHJlZ2lvbixcbiAgICAgIGN1c3RvbVVzZXJBZ2VudDogYWdlbnQsXG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIHN0c2NsaWVudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplR2l0aHViQWN0b3IoYWN0b3I6IHN0cmluZykge1xuICAvLyBJbiBzb21lIGNpcmN1bXN0YW5jZXMgdGhlIGFjdG9yIG1heSBjb250YWluIHNxdWFyZSBicmFja2V0cy4gRm9yIGV4YW1wbGUsIGlmIHRoZXkncmUgYSBib3QgKCdbYm90XScpXG4gIC8vIFNxdWFyZSBicmFja2V0cyBhcmUgbm90IGFsbG93ZWQgaW4gQVdTIHNlc3Npb24gdGFnc1xuICByZXR1cm4gYWN0b3IucmVwbGFjZSgvXFxbfFxcXS9nLCBTQU5JVElaQVRJT05fQ0hBUkFDVEVSKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplR2l0aHViV29ya2Zsb3dOYW1lKG5hbWU6IHN0cmluZykge1xuICAvLyBXb3JrZmxvdyBuYW1lcyBjYW4gYmUgYWxtb3N0IGFueSB2YWxpZCBVVEYtOCBzdHJpbmcsIGJ1dCB0YWdzIGFyZSBtb3JlIHJlc3RyaWN0aXZlLlxuICAvLyBUaGlzIHJlcGxhY2VzIGFueXRoaW5nIG5vdCBjb25mb3JtaW5nIHRvIHRoZSB0YWcgcmVzdHJpY3Rpb25zIGJ5IGludmVydGluZyB0aGUgcmVndWxhciBleHByZXNzaW9uLlxuICAvLyBTZWUgdGhlIEFXUyBkb2N1bWVudGF0aW9uIGZvciBjb25zdHJhaW50IHNwZWNpZmljcyBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vU1RTL2xhdGVzdC9BUElSZWZlcmVuY2UvQVBJX1RhZy5odG1sLlxuICBjb25zdCBuYW1lV2l0aG91dFNwZWNpYWxDaGFyYWN0ZXJzID0gbmFtZS5yZXBsYWNlKC9bXlxccHtMfVxccHtafVxccHtOfV86Lz0rLi1ALV0vZ3UsIFNBTklUSVpBVElPTl9DSEFSQUNURVIpO1xuICBjb25zdCBuYW1lVHJ1bmNhdGVkID0gbmFtZVdpdGhvdXRTcGVjaWFsQ2hhcmFjdGVycy5zbGljZSgwLCBNQVhfVEFHX1ZBTFVFX0xFTkdUSCk7XG4gIHJldHVybiBuYW1lVHJ1bmNhdGVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXJyb3JNZXNzYWdlKGVycm9yOiB1bmtub3duKSB7XG4gIHJldHVybiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0RlZmluZWQ8VD4oaTogVCB8IHVuZGVmaW5lZCB8IG51bGwpOiBpIGlzIFQge1xuICByZXR1cm4gaSAhPT0gdW5kZWZpbmVkICYmIGkgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIHNsZWVwKG1zOiBudW1iZXIpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XG59XG5cbi8vIHJldHJ5QW5kQmFja29mZiByZXRyaWVzIHdpdGggZXhwb25lbnRpYWwgYmFja29mZiB0aGUgcHJvbWlzZSBpZiB0aGUgZXJyb3IgaXNSZXRyeWFibGUgdXB0byBtYXhSZXRyaWVzIHRpbWUuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmV0cnlBbmRCYWNrb2ZmPFQ+KFxuICBmbjogKCkgPT4gUHJvbWlzZTxUPixcbiAgaXNSZXRyeWFibGU6IGJvb2xlYW4sXG4gIHJldHJpZXMgPSAwLFxuICBtYXhSZXRyaWVzID0gMTIsXG4gIGJhc2UgPSA1MFxuKTogUHJvbWlzZTxUPiB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGF3YWl0IGZuKCk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGlmICghaXNSZXRyeWFibGUpIHtcbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gICAgLy8gSXQncyByZXRyeWFibGUsIHNvIHNsZWVwIGFuZCByZXRyeS5cbiAgICBhd2FpdCBzbGVlcChNYXRoLnJhbmRvbSgpICogKE1hdGgucG93KDIsIHJldHJpZXMpICogYmFzZSkpO1xuICAgIHJldHJpZXMgKz0gMTtcbiAgICBpZiAocmV0cmllcyA9PT0gbWF4UmV0cmllcykge1xuICAgICAgdGhyb3cgZXJyO1xuICAgIH1cbiAgICByZXR1cm4gYXdhaXQgcmV0cnlBbmRCYWNrb2ZmKGZuLCBpc1JldHJ5YWJsZSwgcmV0cmllcywgbWF4UmV0cmllcywgYmFzZSk7XG4gIH1cbn1cbiJdfQ==