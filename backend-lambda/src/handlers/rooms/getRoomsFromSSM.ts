import PQueue from '@esm2cjs/p-queue';
import { SSM } from '@aws-sdk/client-ssm';
import { notUndefined } from '../../helpers/notUndefined';
import { failure, isFailure, isSuccess, Result, success, successValue } from '../../helpers/result';
import { ssm } from '../../helpers/ssm';
import { getOrderFromTag } from './getOrderFromTag';
import { getRoomWithTags } from './getRoomWithTags';
import { Room } from './Room';

const roomTagsQueue = new PQueue({ concurrency: 4 });

export const makeGetRoomsFromSSM = (roomSSM: SSM) => async (): Promise<Result<Error, Room[]>> => {
  const path = '/multiview/mux/';

  const { Parameters } = await roomSSM.getParametersByPath({ Path: path });

  if (Parameters == null) {
    return failure(new Error('Unexpected AWS response'));
  }

  const eventuallyNames = Parameters.map(({ Name }) => Name)
    .filter(notUndefined)
    .map((name) => {
      const x = roomTagsQueue.add(() => getRoomWithTags(roomSSM, name));
      return x;
    });

  const maybeRooms = (await Promise.all(eventuallyNames)).map((r) => {
    if (r == null) {
      return failure(new Error('Cancelled'));
    }
    return r;
  });

  const errors = maybeRooms.filter(isFailure).map(({ value }) => value);

  if (errors.length > 0) {
    return failure(new Error(`${errors.length} errors fetching tags. ${errors.map((e) => e.message).join(', ')}`));
  }

  const rooms = maybeRooms
    .filter(isSuccess)
    .map(successValue)
    .filter(({ tags }) => tags['multiview:show'] === 'true')
    .map(({ id, tags }, index) => ({
      id: id.substring(path.length),
      title: tags['multiview:title'],
      order: getOrderFromTag(tags['multiview:order'], index),
    }))
    .sort(({ order: firstOrder }, { order: secondOrder }) => firstOrder - secondOrder);

  return success(rooms);
};

export const getRoomsFromSSM = makeGetRoomsFromSSM(ssm);
