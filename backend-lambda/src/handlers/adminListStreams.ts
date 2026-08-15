import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { catchErrors } from '../helpers/catchErrors';
import { accessDenied, response } from '../helpers/response';
import { isFailure, successValue } from '../helpers/result';
import { requireRole } from '../helpers/requireRole';
import { demos } from './mux/demos';
import { listStreamsFromSSM } from './admin/listStreamsFromSSM';

export const adminListStreams: APIGatewayProxyHandlerV2 = catchErrors(async (event) => {
  if (!(await requireRole(event))) {
    return accessDenied();
  }

  const maybeStreams = await listStreamsFromSSM();

  if (isFailure(maybeStreams)) {
    throw maybeStreams.value;
  }

  return response(
    {
      ok: true,
      streams: successValue(maybeStreams),
      // The UI builds its demo dropdown from this, so the two cannot drift.
      demos: Object.keys(demos),
    },
    200,
    {
      'Cache-Control': 'no-cache',
    },
  );
});
