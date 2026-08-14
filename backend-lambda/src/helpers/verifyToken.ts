import { verify } from 'jsonwebtoken';
import { isDecodedJWT } from '../types.guard';
import { isFailure, successValue } from './result';
import { getCachedSecret } from './getCachedSecret';
import { DecodedJWT } from '../types';

const ATTEND_JWT_PRIVATE_KEY = process.env.ATTEND_JWT_PRIVATE_KEY;
const ATTEND_JWT_AUDIENCE = process.env.ATTEND_JWT_AUDIENCE;
const ATTEND_JWT_ISSUER = process.env.ATTEND_JWT_ISSUER;

export const verifyToken = async (token: string, forceRefreshKey = false): Promise<DecodedJWT | undefined> => {
  if (!ATTEND_JWT_PRIVATE_KEY) {
    console.log('ATTEND_JWT_PRIVATE_KEY not set');
    return undefined;
  }
  if (!ATTEND_JWT_AUDIENCE) {
    console.log('ATTEND_JWT_AUDIENCE not set');
    return undefined;
  }
  if (!ATTEND_JWT_ISSUER) {
    console.log('ATTEND_JWT_ISSUER not set');
    return undefined;
  }

  const maybePrivateKey = await getCachedSecret(ATTEND_JWT_PRIVATE_KEY, forceRefreshKey);

  if (isFailure(maybePrivateKey)) {
    console.log(`Unable to get ${ATTEND_JWT_PRIVATE_KEY}`, maybePrivateKey.value);
    return undefined;
  }
  const jwtPrivateKey = successValue(maybePrivateKey);

  let decodedToken;
  try {
    decodedToken = verify(token, jwtPrivateKey, { algorithms: ['HS256'] });
  } catch (err) {
    console.log(`Error decoding JWT: ${(err as Error).message} for ${token}`);
    return undefined;
  }

  if (!isDecodedJWT(decodedToken)) {
    return undefined;
  }

  if (decodedToken.iss !== ATTEND_JWT_ISSUER || decodedToken.aud !== ATTEND_JWT_AUDIENCE) {
    console.log(`Unexpected iss ${decodedToken.iss} or aud ${decodedToken.aud}`);
    return undefined;
  }

  return decodedToken;
};
