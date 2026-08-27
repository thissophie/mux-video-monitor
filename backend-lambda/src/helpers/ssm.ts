import { SSM } from '@aws-sdk/client-ssm';
import { makeLocalSSM, parseLocalParameters } from '../local/localSSM';
import { credentialProvider } from './credentialProvider';

const localParameters = process.env.LOCAL_SSM_PARAMETERS;

export const ssm = localParameters
  ? makeLocalSSM(parseLocalParameters(localParameters))
  : new SSM({ credentials: credentialProvider });
