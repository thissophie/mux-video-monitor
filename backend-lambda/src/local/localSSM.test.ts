import { successValue } from '../helpers/result';
import { makeGetStreamStateFromSSMAndMux } from '../handlers/mux/makeGetStreamStateFromSSMAndMux';
import { makeGetRoomsFromSSM } from '../handlers/rooms/getRoomsFromSSM';
import { makeLocalSSM, parseLocalParameters } from './localSSM';

const configuration = JSON.stringify({
  '/multiview/mux/room-2': {
    value: 'unused-demo-secret',
    tags: {
      'multiview:title': 'Room 2',
      'multiview:order': '2',
      'multiview:show': 'true',
      'multiview:demo': 'offline',
      'multiview:data-env-key': 'data-key',
    },
  },
  '/multiview/mux/room-1': {
    value: 'unused-demo-secret',
    tags: {
      'multiview:title': 'Room 1',
      'multiview:order': '1',
      'multiview:show': 'true',
      'multiview:demo': 'fake-stream',
    },
  },
  '/multiview/mux/hidden-room': {
    value: 'unused-demo-secret',
    tags: {
      'multiview:title': 'Hidden room',
      'multiview:show': 'false',
    },
  },
});

describe('local SSM configuration', () => {
  it('feeds the normal multi-room SSM discovery path', async () => {
    const ssm = makeLocalSSM(parseLocalParameters(configuration));

    const result = await makeGetRoomsFromSSM(ssm)();

    expect(successValue(result)).toEqual([
      { id: 'room-1', title: 'Room 1', order: 1 },
      { id: 'room-2', title: 'Room 2', order: 2 },
    ]);
  });

  it('feeds the normal stream-state path including Mux Data tags', async () => {
    const ssm = makeLocalSSM(parseLocalParameters(configuration));

    const result = await makeGetStreamStateFromSSMAndMux(ssm)('room-2');

    expect(successValue(result)).toEqual({
      state: 'not-active',
      title: 'Room 2',
      muxDataEnvironmentKey: 'data-key',
    });
  });

  it('rejects configuration outside the production SSM path', () => {
    expect(() => parseLocalParameters('{"room-1":{"value":"secret","tags":{}}}')).toThrow(
      'must be under /multiview/mux/',
    );
  });

  it('matches SSM missing-resource behavior when listing tags', async () => {
    const ssm = makeLocalSSM(parseLocalParameters(configuration));

    await expect(
      ssm.listTagsForResource({ ResourceType: 'Parameter', ResourceId: '/multiview/mux/missing-room' }),
    ).rejects.toMatchObject({ name: 'InvalidResourceId' });
  });
});
