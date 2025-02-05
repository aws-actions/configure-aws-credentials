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
export declare function cleanup(): void;
