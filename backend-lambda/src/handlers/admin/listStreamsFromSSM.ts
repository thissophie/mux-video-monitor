import { GetParametersByPathResult } from '@aws-sdk/client-ssm';
import PQueue from '@esm2cjs/p-queue';
import { notUndefined } from '../../helpers/notUndefined';
import { failure, isFailure, isSuccess, Result, success, successValue } from '../../helpers/result';
import { ssm } from '../../helpers/ssm';
import { getOrderFromTag } from '../rooms/getOrderFromTag';
import { getRoomWithTags, RoomWithTags } from '../rooms/getRoomWithTags';
import { AdminStream, AdminTags, TAG_ORDER } from './AdminStream';

const path = '/multiview/mux/';

const tagsQueue = new PQueue({ concurrency: 4 });

const orderOf = (tags: AdminTags): number => getOrderFromTag(tags[TAG_ORDER], Number.MAX_SAFE_INTEGER);

/**
 * Every parameter under /multiview/mux/ with its tags, unfiltered — unlike
 * getRoomsFromSSM, which drops anything without multiview:show=true. The admin UI
 * must be able to see (and un-hide) hidden rooms.
 *
 * Only Name is read from the response. The parameter values are Mux token secrets
 * and must never reach a client.
 */
export const listStreamsFromSSM = async (): Promise<Result<Error, AdminStream[]>> => {
  const names: string[] = [];
  let nextToken: string | undefined = undefined;

  // getParametersByPath returns 10 per page by default. getRoomsFromSSM does not
  // paginate; an admin list that silently truncates would be a bad failure mode.
  do {
    // Annotated because nextToken is assigned from page, which is derived from a
    // call taking nextToken — without this the inference is circular (TS7022).
    const page: GetParametersByPathResult = await ssm.getParametersByPath({ Path: path, NextToken: nextToken });

    if (page.Parameters == null) {
      return failure(new Error('Unexpected AWS response'));
    }

    names.push(...page.Parameters.map(({ Name }) => Name).filter(notUndefined));

    nextToken = page.NextToken;
  } while (nextToken !== undefined);

  // PQueue.add resolves to `Result | void`, so the null check is not optional —
  // this mirrors getRoomsFromSSM rather than using `??`, which does not narrow a
  // `void` union cleanly under strict.
  const settled = await Promise.all(names.map((name) => tagsQueue.add(() => getRoomWithTags(ssm, name))));

  const maybeStreams = settled.map((r) => {
    if (r == null) {
      return failure<Error, RoomWithTags>(new Error('Cancelled'));
    }
    return r;
  });

  const errors = maybeStreams.filter(isFailure).map(({ value }) => value);

  if (errors.length > 0) {
    return failure(new Error(`${errors.length} errors fetching tags. ${errors.map((e) => e.message).join(', ')}`));
  }

  const streams = maybeStreams
    .filter(isSuccess)
    .map(successValue)
    .map(({ id, tags }) => ({ id: id.substring(path.length), tags }))
    .sort((first, second) => orderOf(first.tags) - orderOf(second.tags) || first.id.localeCompare(second.id));

  return success(streams);
};
