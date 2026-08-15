import { Result, failure, success } from '../helpers/result';
import { AccessDenied } from '../helpers/AccessDenied';
import { AdminTags } from './fetchStreams';

export interface TagEdits {
  title?: string;
  // Omitted entirely when the field is blank. A stream with no multiview:order tag
  // is a supported state (getOrderFromTag defaults it), and sending '' would fail
  // validation on every save, even one that only changed the title.
  order?: string;
  show: boolean;
  demo: string | null;
}

export interface SavedStream {
  tags: AdminTags;
  refreshed: boolean;
}

interface SaveResponseOk {
  ok: true;
  refreshed: boolean;
  stream: { id: string; tags: AdminTags };
}

interface SaveResponseError {
  ok: false;
  error: string;
}

export const saveStream = async (id: string, edits: TagEdits): Promise<Result<Error, SavedStream>> => {
  try {
    const fetchResponse = await fetch(`/api/admin/streams/${encodeURIComponent(id)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edits),
    });

    const body = (await fetchResponse.json()) as SaveResponseOk | SaveResponseError;

    if (body.ok === false) {
      if (fetchResponse.status === 403) {
        throw new AccessDenied(body.error, fetchResponse.status);
      }
      throw new Error(body.error);
    }

    return success({ tags: body.stream.tags, refreshed: body.refreshed });
  } catch (err) {
    return failure(err as Error);
  }
};
