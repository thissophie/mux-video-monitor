import { nanoid } from 'nanoid';
import { Result, failure, success } from './helpers/result';
import { AccessDenied } from './helpers/AccessDenied';

export interface Room {
  id: string;
  name: string;
}

interface FetchRoomsResponseRoom {
  id: string;
  title: string;
}

interface FetchRoomsResponseOk {
  ok: true;
  rooms: FetchRoomsResponseRoom[];
}

interface FetchRoomsResponseError {
  ok: false;
  error: string;
}

export const fetchRooms = async (): Promise<Result<Error, Room[]>> => {
  try {
    const before = Date.now();
    const fetchResponse = await fetch(`/api/stream?${nanoid()}`, { credentials: 'include' });

    const rooms = (await fetchResponse.json()) as FetchRoomsResponseOk | FetchRoomsResponseError;

    if (rooms.ok === false) {
      if (fetchResponse.status === 403) {
        throw new AccessDenied(rooms.error, fetchResponse.status);
      }
      throw new Error(rooms.error);
    }

    const r = rooms.rooms.map((room) => ({
      id: room.id,
      name: room.title,
    }));

    const totalTime = Date.now() - before;

    console.log(`[Rooms] Got rooms in ${totalTime}ms`, rooms);
    return success(r);
  } catch (err) {
    return failure(err as Error);
  }
};

export const iframeURI = (id: string): string => `dynamic.html?id=${encodeURIComponent(id)}&v=${nanoid()}`;
export const viewerURI = (id: string): string => `all.html?only=${encodeURIComponent(id)}&v=${nanoid()}`;
export const castURI = (id: string): string => `cast.html?id=${encodeURIComponent(id)}&v=${nanoid()}`;

export const attendURI = (id: string, playerOverride = 'play.html'): string =>
  `${playerOverride}?stream=${encodeURIComponent(id)}&v=${nanoid()}`;
