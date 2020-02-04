#!/bin/bash

set -ex

# Generate a new version number and version tag, based on conventional commits
standard-version

# Prevent major version bumps: these warrant extra scrutiny
NEW_VERSION=`cat package-lock.json | jq -r '.version'`
if [[ ! "$NEW_VERSION" =~ ^v1\. ]]; then
    echo "New major version! $NEW_VERSION"
    exit 1
fi

# Push the new version tag
git push --follow-tags origin master

# Create a GitHub release for the new version
dpl --provider=releases \
    --name="v$NEW_VERSION" \
    --tag_name="v$NEW_VERSION" \
    --api_key="$GITHUB_TOKEN" \
    --draft=$IS_DRAFT

# Update the 'v1' tag to point to the new version
git tag -f v1
git push -f origin v1
