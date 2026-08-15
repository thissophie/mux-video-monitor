import { failure, Result, success } from '../../helpers/result';
import { AdminTagEditRequest } from '../../types';
import { TAG_DEMO, TAG_ORDER, TAG_SHOW, TAG_TITLE, TagEditPlan } from './AdminStream';

const INTEGER = /^-?\d+$/;

/**
 * Validates a tag edit request and turns it into tags to write and tag keys to
 * delete. Pure: does no IO. `validDemos` comes from handlers/mux/demos.ts so the
 * accepted values cannot drift from the ones the player understands.
 */
export const parseTagEdits = (request: AdminTagEditRequest, validDemos: string[]): Result<Error, TagEditPlan> => {
  const set: Record<string, string> = {};
  const remove: string[] = [];

  if (request.title !== undefined) {
    const title = request.title.trim();
    if (title.length === 0) {
      // getRoomWithTags discards falsy tag values, so an empty title is a removal.
      remove.push(TAG_TITLE);
    } else {
      set[TAG_TITLE] = title;
    }
  }

  if (request.order !== undefined) {
    if (typeof request.order === 'number') {
      if (!Number.isInteger(request.order)) {
        return failure(new Error('order must be a whole number'));
      }
      set[TAG_ORDER] = String(request.order);
    } else {
      // parseInt('12abc') is 12, so test the whole string before converting.
      if (!INTEGER.test(request.order.trim())) {
        return failure(new Error('order must be a whole number'));
      }
      set[TAG_ORDER] = String(parseInt(request.order.trim(), 10));
    }
  }

  if (request.show !== undefined) {
    set[TAG_SHOW] = request.show ? 'true' : 'false';
  }

  if (request.demo !== undefined) {
    if (request.demo === null) {
      remove.push(TAG_DEMO);
    } else if (!validDemos.includes(request.demo)) {
      return failure(new Error(`demo must be one of ${validDemos.join(', ')}`));
    } else {
      set[TAG_DEMO] = request.demo;
    }
  }

  return success({ set, remove });
};
