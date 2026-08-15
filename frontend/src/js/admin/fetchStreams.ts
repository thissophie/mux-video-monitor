import { nanoid } from 'nanoid';
import { Result, failure, success } from '../helpers/result';
import { AccessDenied } from '../helpers/AccessDenied';

export type AdminTags = Record<string, string>;

export interface AdminStream {
  id: string;
  tags: AdminTags;
}

export interface AdminStreams {
  streams: AdminStream[];
  demos: string[];
}

interface AdminStreamsResponseOk {
  ok: true;
  streams: AdminStream[];
  demos: string[];
}

interface AdminStreamsResponseError {
  ok: false;
  error: string;
}

export const fetchStreams = async (): Promise<Result<Error, AdminStreams>> => {
  try {
    const fetchResponse = await fetch(`/api/admin/streams?${nanoid()}`, { credentials: 'include' });

    const body = (await fetchResponse.json()) as AdminStreamsResponseOk | AdminStreamsResponseError;

    if (body.ok === false) {
      if (fetchResponse.status === 403) {
        throw new AccessDenied(body.error, fetchResponse.status);
      }
      throw new Error(body.error);
    }

    return success({ streams: body.streams, demos: body.demos });
  } catch (err) {
    return failure(err as Error);
  }
};
