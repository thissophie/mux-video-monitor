import { isFailure, Result, success, successValue } from '../../helpers/result';
import { getRoomsFromDynamo } from '../rooms/getRoomsFromDynamo';
import { getStreamStateFromDynamo } from '../mux/getStreamStateFromDynamo';
import { getAblyClient } from '../ably/getAblyClient';
import { StreamStateWithTitle } from '../mux/StreamState';

const CHANNEL = 'mux-monitor.aws.nextdayvideo.com.au';

/**
 * A tag edit can change both caches: multiview:show and multiview:order feed
 * rooms/all, while multiview:title and multiview:demo feed stream/<roomId>.
 * /api/refresh only does the former, so both are forced here.
 *
 * The Ably publish is best-effort. By the time it runs the tags are written and
 * both caches are correct, so a publish failure must not be reported as a failed
 * save.
 */
export const refreshAfterEdit = async (
  tableName: string,
  roomId: string,
): Promise<Result<Error, StreamStateWithTitle>> => {
  const maybeAblyTask = getAblyClient();

  const maybeRooms = await getRoomsFromDynamo(tableName, true);
  if (isFailure(maybeRooms)) {
    return maybeRooms;
  }

  const maybeState = await getStreamStateFromDynamo(tableName, roomId, true);
  if (isFailure(maybeState)) {
    return maybeState;
  }

  const state = successValue(maybeState);

  const maybeAbly = await maybeAblyTask;

  if (isFailure(maybeAbly)) {
    console.log('Failed to initialise ably', maybeAbly.value);
  } else {
    const ably = successValue(maybeAbly);

    if (ably == undefined) {
      console.log('Not notifying ably (ABLY_SERVER_KEY not set)');
    } else {
      try {
        await ably.channels.get(CHANNEL).publish('stream', { roomId, why: 'admin-edit', ...state });
      } catch (err) {
        console.log('Failed to publish to ably', err);
      }
    }
  }

  return success(state);
};
