import * as Ably from 'ably';
import { Result, failure, isFailure, success, successValue } from '../helpers/result';
import { AccessDenied } from '../helpers/AccessDenied';

interface AblyKeyOk {
  ok: true;
  key: string;
}

interface AblyKeyError {
  ok: false;
  error: string;
}

const fetchAblyKey = async (): Promise<Result<Error, string>> => {
  try {
    const before = Date.now();
    const fetchResponse = await fetch(`/api/ably`, { credentials: 'include' });

    // TODO: Validate state
    const state = (await fetchResponse.json()) as AblyKeyOk | AblyKeyError;
    if (state.ok === false) {
      if (fetchResponse.status === 403) {
        throw new AccessDenied(state.error, fetchResponse.status);
      }
      throw new Error(state.error);
    }

    const totalTime = Date.now() - before;

    console.log(`[ably] Got key in ${totalTime}ms`, state);

    return success(state.key);
  } catch (err) {
    return failure(err as Error);
  }
};

export const launchAbly = async (): Promise<Result<Error, Ably.Types.RealtimePromise>> => {
  const maybeKey = await fetchAblyKey();
  if (isFailure(maybeKey)) {
    return maybeKey;
  }

  const key = successValue(maybeKey);

  const client = new Ably.Realtime.Promise({ key });

  return success(client);
};

export type AblyStreamUpdate = {
  roomId?: string | undefined;
  why?: string | undefined;
  state?: 'active' | 'not-active' | undefined;
  streamURL?: string | undefined;
  title?: string | undefined;
  muxDataEnvironmentKey?: string | undefined;
};

// {
//   "roomId": "8e594d08-22d1-4a3b-b88a-69d66311d570",
//   "why": "video.live_stream.active",
//   "state": "active",
//   "streamURL": "https://stream.mux.com/z1GIx3QUUntdL008IP3flXDIoIzFG00V01ZCyXfzmaVX01o.m3u8",
//   "title": "1 - Kaya Theatre"
// }
