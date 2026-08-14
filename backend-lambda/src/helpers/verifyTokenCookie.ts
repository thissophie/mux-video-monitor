import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { parseCookies } from './parseCookies';
import { verifyToken } from './verifyToken';

export const verifyTokenCookie = async (event: APIGatewayProxyEventV2, forceRefreshTokenKey = false) => {
  const ndvCookie = parseCookies(event.cookies).NDV_AUD;
  if (ndvCookie == null) {
    console.log(`(requestId=${event.requestContext.requestId}) Access denied because there was no token in NDV_AUD.`);
    return undefined;
  }

  const verifiedToken = await verifyToken(ndvCookie, forceRefreshTokenKey);

  if (!verifiedToken) {
    console.log(
      `(requestId=${event.requestContext.requestId}) Access denied because the token in NDV_AUD did not verify.`,
    );
    return undefined;
  }

  return { cookie: ndvCookie, token: verifiedToken };
};
