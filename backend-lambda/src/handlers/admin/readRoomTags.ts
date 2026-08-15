import { SSM } from '@aws-sdk/client-ssm';
import { failure, isFailure, Result, success, successValue } from '../../helpers/result';
import { getRoomWithTags } from '../rooms/getRoomWithTags';
import { AdminTags } from './AdminStream';

/**
 * Current tags for one room. Unlike getRoomWithTags this catches, so a missing
 * parameter surfaces as a failure carrying InvalidResourceId rather than
 * throwing — which lets the handler answer 404 instead of 500.
 */
export const readRoomTags = async (ssm: SSM, roomId: string): Promise<Result<Error, AdminTags>> => {
  try {
    const maybeRoom = await getRoomWithTags(ssm, `/multiview/mux/${roomId}`);

    if (isFailure(maybeRoom)) {
      return maybeRoom;
    }

    return success(successValue(maybeRoom).tags);
  } catch (err) {
    return failure(err as Error);
  }
};
