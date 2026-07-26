#!/bin/bash

# errexit:  Exit immediately if a command exits with a non-zero status.
# nounset:  Treat unset variables as an error when substituting.
# pipefail: The return value of a pipeline is the status of the last command
#           to exit with a non-zero status, or zero if no command exited with
#           a non-zero status.
set -o errexit -o nounset -o pipefail

cd $(dirname "$0")/..

. ../ci/functions.sh

object=$(ci/current-object.sh)

echo LAMBDA_BUCKET=$LAMBDA_BUCKET
echo object=$object

if ! s3_object_exists $LAMBDA_BUCKET $object; then
  start_group "Installing dependencies"
  corepack enable
  pnpm install
  end_group

  start_group "Building"
  pnpm run build
  end_group

  start_group "Uploading to s3://$LAMBDA_BUCKET/$object"
  aws s3 cp build.zip "s3://$LAMBDA_BUCKET/$object"
  end_group
fi

echo s3://$LAMBDA_BUCKET/$object

echo "::set-output name=bucket::$LAMBDA_BUCKET"
echo "::set-output name=object::$object"
