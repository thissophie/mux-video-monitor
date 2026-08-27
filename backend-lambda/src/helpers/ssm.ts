import { SSM } from '@aws-sdk/client-ssm';
import { credentialProvider } from './credentialProvider';

export const ssm = new SSM({ credentials: credentialProvider });
