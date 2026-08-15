import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { verifyTokenCookie } from './verifyTokenCookie';
import { JWTRequiredRole } from './env/ATTEND_JWT_REQUIRED_ROLE';

/**
 * Verifies the NDV_AUD cookie and checks the token carries one of the roles in
 * ATTEND_JWT_REQUIRED_ROLE. Returns undefined when the caller should be denied.
 */
export const requireRole = async (event: APIGatewayProxyEventV2) => {
  const maybeToken = await verifyTokenCookie(event, true);

  if (!maybeToken) {
    return undefined;
  }

  const requiredRoles = (JWTRequiredRole ?? '')
    .split(',')
    .map((role) => role.trim())
    .filter((role) => role.length > 0);

  if (requiredRoles.length == 0) {
    console.log(
      `(requestId=${event.requestContext.requestId}) Access denied because ATTEND_JWT_REQUIRED_ROLE is not set.`,
    );
    return undefined;
  }

  const hasRequiredRole = requiredRoles.some((role) => role === maybeToken.token.role);
  if (!hasRequiredRole) {
    console.log(
      `(requestId=${event.requestContext.requestId}) Access denied because the token does not have any of ${requiredRoles.join(',')}.`,
    );

    return undefined;
  }

  return maybeToken;
};
