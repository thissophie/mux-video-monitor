#!/bin/bash

set -o errexit -o nounset -o pipefail

cd $(dirname "$0")/..

. ../ci/functions.sh

# Install, test and build (shared with the pull_request check in
# .github/workflows/frontend-pr.yaml so both run the identical build).
ci/build.sh

start_group "Uploading to s3://$FRONTEND_BUCKET"
aws s3 sync --exclude "*" --include "*.html" --content-type "text/html; charset=utf-8" --delete ./dist "s3://${FRONTEND_BUCKET}/"
aws s3 sync --include "*" --exclude "*.html" --delete ./dist  "s3://${FRONTEND_BUCKET}/"
end_group
