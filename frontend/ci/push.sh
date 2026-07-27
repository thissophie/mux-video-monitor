#!/bin/bash

set -o errexit -o nounset -o pipefail

cd $(dirname "$0")/..

. ../ci/functions.sh

start_group "Installing dependencies"
corepack enable
pnpm install --frozen-lockfile
end_group

# start_group "Lint"
# npm run lint
# end_group

start_group "Building"
npm run clean
npm test
npm run build
end_group

start_group "Uploading to s3://$FRONTEND_BUCKET"
aws s3 sync --exclude "*" --include "*.html" --content-type "text/html; charset=utf-8" --delete ./dist "s3://${FRONTEND_BUCKET}/"
aws s3 sync --include "*" --exclude "*.html" --delete ./dist  "s3://${FRONTEND_BUCKET}/"
end_group
