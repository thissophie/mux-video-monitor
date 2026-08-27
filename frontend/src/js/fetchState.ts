import { nanoid } from 'nanoid';
import { Result, failure, success } from './helpers/result';
import { AccessDenied } from './helpers/AccessDenied';
import { NotFound } from './helpers/NotFound';

interface MuxStreamStateOnline {
  ok: true;
  online: true;
  stream: string;
  title: string;
  muxDataEnvironmentKey?: string;
}

interface MuxStreamStateOffline {
  ok: true;
  online: false;
  title: string;
  muxDataEnvironmentKey?: string;
}

interface MuxStreamStateError {
  ok: false;
  error: string;
}

export type MuxStreamState = MuxStreamStateOnline | MuxStreamStateOffline;

export const fetchState = async (id: string): Promise<Result<Error, MuxStreamState>> => {
  try {
    const before = Date.now();
    const fetchResponse = await fetch(`/api/stream/${encodeURIComponent(id)}?${nanoid()}`, { credentials: 'include' });

    // TODO: Validate state
    const state = (await fetchResponse.json()) as MuxStreamStateOnline | MuxStreamStateOffline | MuxStreamStateError;

    if (state.ok === false) {
      if (fetchResponse.status === 403) {
        throw new AccessDenied(state.error, fetchResponse.status);
      }
      if (fetchResponse.status === 404) {
        throw new NotFound(state.error, fetchResponse.status);
      }
      throw new Error(state.error);
    }

    const totalTime = Date.now() - before;

    console.log(`[%s] Got state in %dms`, id, totalTime, state);

    return success(state);
  } catch (err) {
    return failure(err as Error);
  }
};
