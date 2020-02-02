#!/bin/bash

set -ex

# Retrieve the action commit ID to test
ACTION_GIT_COMMIT_ID=`git rev-parse HEAD`

# Update the integ test action workflow file with the latest action commit ID
git checkout integ-tests
sed -i "s|aws-actions/configure-aws-credentials@v1|aws-actions/configure-aws-credentials@$ACTION_GIT_COMMIT_ID|g" test-workflow.yml
mkdir -p .github/workflows
cp test-workflow.yml .github/workflows
git add .github/workflows
git commit -m "Test commit $ACTION_GIT_COMMIT_ID"

# Trigger the action workflow
git push origin integ-tests

# Validate that the action workflow succeeds
# Exit codes: success = 0; failure = 1; pending = 2; no status = 3
while hub ci-status; [ $? -ge 2 ]; do
  echo "waiting for test workflow to complete..."
  sleep 5
done

hub ci-status
