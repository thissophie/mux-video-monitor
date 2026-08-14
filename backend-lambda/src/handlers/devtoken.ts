import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { TableName } from '../helpers/TableName';
import { catchErrors } from '../helpers/catchErrors';
import { accessDenied, response } from '../helpers/response';
import { verifyTokenCookie } from '../helpers/verifyTokenCookie';
import { JWTRequiredRole } from '../helpers/env/ATTEND_JWT_REQUIRED_ROLE';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const devtoken: APIGatewayProxyHandlerV2 = catchErrors(async (event, context) => {
  if (!TableName) {
    throw new Error('CACHE_TABLE_NAME not set');
  }

  const maybeToken = await verifyTokenCookie(event, true);

  if (!maybeToken) {
    return accessDenied();
  }

  const requiredRoles = (JWTRequiredRole ?? '')
    .split(',')
    .map((role) => role.trim())
    .filter((role) => role.length > 0);

  if (requiredRoles.length == 0) {
    return accessDenied();
  }

  const hasRequiredRole = requiredRoles.some((role) => role === maybeToken.token.role);
  if (!hasRequiredRole) {
    console.log(
      `(requestId=${event.requestContext.requestId}) Access denied because the token does not have any of ${requiredRoles.join(',')}.`,
    );

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
