import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { TableName } from '../helpers/TableName';
import { catchErrors } from '../helpers/catchErrors';
import { accessDenied, response } from '../helpers/response';
import { requireRole } from '../helpers/requireRole';

export const devtoken: APIGatewayProxyHandlerV2 = catchErrors(async (event) => {
  if (!TableName) {
    throw new Error('CACHE_TABLE_NAME not set');
  }

  const maybeToken = await requireRole(event);

  if (!maybeToken) {
    return accessDenied();
  }

  return response(
    {
      ok: true,
      cookie: maybeToken.cookie,
    },
    200,
    {
      'Cache-Control': 'no-cache',
    },
  );
});
