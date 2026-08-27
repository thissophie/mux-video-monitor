import { SSM } from '@aws-sdk/client-ssm';
import { failure, isFailure, Result, success, successValue } from '../../helpers/result';
import { getRoomWithTags } from '../rooms/getRoomWithTags';
import { getStreamURL } from './getStreamURL';
import { StreamStateWithTitle } from './StreamState';
import { demos } from './demos';
import { maybeGetSecret } from '../../helpers/maybeGetSecret';

export const MUX_DATA_ENVIRONMENT_KEY_TAG = 'multiview:data-env-key';

export const makeGetStreamStateFromSSMAndMux =
  (ssm: SSM, fetchStreamURL = getStreamURL) =>
  async (roomId: string): Promise<Result<Error, StreamStateWithTitle>> => {
    const maybeMuxTokenSecret = await maybeGetSecret(ssm, `/multiview/mux/${roomId}`);
    if (isFailure(maybeMuxTokenSecret)) {
      console.log('No secret found for ' + roomId);
      return failure(new Error('Not found'));
    }

    const maybeGetTags = await getRoomWithTags(ssm, `/multiview/mux/${roomId}`);
    if (isFailure(maybeGetTags)) {
      console.log('No tags found for ' + roomId);
      return failure(new Error('Could not get tags'));
    }

    const { tags } = successValue(maybeGetTags);

    const title = tags['multiview:title'] || roomId;
    const muxDataEnvironmentKey = tags[MUX_DATA_ENVIRONMENT_KEY_TAG]?.trim();
    const dataConfiguration = muxDataEnvironmentKey ? { muxDataEnvironmentKey } : {};

    const demoResponse = demos[tags['multiview:demo'] || 'none'];
    if (demoResponse) {
      return success({ ...demoResponse, title, ...dataConfiguration });
    }
    const muxTokenSecret = successValue(maybeMuxTokenSecret);

    const maybeStream = await fetchStreamURL(roomId, muxTokenSecret);
    if (isFailure(maybeStream)) {
      return failure(new Error('Unable to retrieve stream state from mux'));
    }

    const stream = successValue(maybeStream);

    return success({ ...stream, title, ...dataConfiguration });
  };
