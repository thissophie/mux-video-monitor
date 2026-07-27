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
pnpm run clean
pnpm test
pnpm run build
end_group
