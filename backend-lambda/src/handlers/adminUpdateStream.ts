import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { catchErrors } from '../helpers/catchErrors';
import { accessDenied, invalidRequest, notFound, response } from '../helpers/response';
import { isFailure, successValue } from '../helpers/result';
import { parseBody } from '../helpers/parseBody';
import { requireRole } from '../helpers/requireRole';
import { ssm } from '../helpers/ssm';
import { TableName } from '../helpers/TableName';
import { isAdminTagEditRequest } from '../types.guard';
import { demos } from './mux/demos';
import { applyTagEdits, isMissingParameterError } from './admin/applyTagEdits';
import { parseTagEdits } from './admin/parseTagEdits';
import { readRoomTags } from './admin/readRoomTags';
import { refreshAfterEdit } from './admin/refreshAfterEdit';

export const adminUpdateStream: APIGatewayProxyHandlerV2 = catchErrors(async (event) => {
  if (!TableName) {
    throw new Error('CACHE_TABLE_NAME not set');
  }

  if (!(await requireRole(event))) {
    return accessDenied();
  }

  const roomId = event.pathParameters?.muxTokenId;
  if (roomId === undefined || roomId.length === 0) {
    return notFound();
  }

  const maybeBody = parseBody(event.body, isAdminTagEditRequest);
  if (isFailure(maybeBody)) {
    return invalidRequest('Body must be a tag edit request');
  }

  const maybePlan = parseTagEdits(successValue(maybeBody), Object.keys(demos));
  if (isFailure(maybePlan)) {
    return invalidRequest(maybePlan.value.message);
  }

  const plan = successValue(maybePlan);

  // Read first, for two reasons: it turns a bad roomId into a 404 rather than a
  // 500, and it lets us drop removals for tags that are not set. Whether SSM
  // treats removing an absent tag key as a no-op is undocumented, and clearing
  // the title of a never-titled stream would send exactly that.
  const maybeCurrentTags = await readRoomTags(ssm, roomId);
  if (isFailure(maybeCurrentTags)) {
    if (isMissingParameterError(maybeCurrentTags.value)) {
      console.log(`No parameter for ${roomId}`);
      return notFound();
    }
    throw maybeCurrentTags.value;
  }

  const currentTags = successValue(maybeCurrentTags);

  const maybeApplied = await applyTagEdits(ssm, roomId, {
    set: plan.set,
    remove: plan.remove.filter((key) => currentTags[key] !== undefined),
  });

  if (isFailure(maybeApplied)) {
    if (isMissingParameterError(maybeApplied.value)) {
      console.log(`No parameter for ${roomId}`);
      return notFound();
    }
    throw maybeApplied.value;
  }

  // The tags are already committed. A refresh failure must not be reported as a
  // failed save: getStreamStateFromDynamo reaches Mux, so clearing multiview:demo
  // on a stream that is not currently live fails here for a save that landed
  // correctly. Report it separately and let the 60s TTL catch up.
  const maybeRefreshed = await refreshAfterEdit(TableName, roomId);
  if (isFailure(maybeRefreshed)) {
    console.log(`Tags written for ${roomId} but the refresh failed`, maybeRefreshed.value);
  }

  const maybeTags = await readRoomTags(ssm, roomId);
  if (isFailure(maybeTags)) {
    throw maybeTags.value;
  }

  return response(
    {
      ok: true,
      refreshed: !isFailure(maybeRefreshed),
      stream: { id: roomId, tags: successValue(maybeTags) },
    },
    200,
    {
      'Cache-Control': 'no-cache',
    },
  );
});
