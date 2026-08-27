import { SSM } from '@aws-sdk/client-ssm';
import { isSuccess, success, successValue } from '../../helpers/result';
import { makeGetStreamStateFromSSMAndMux } from './makeGetStreamStateFromSSMAndMux';

const makeSSM = (tags: Record<string, string>): SSM =>
  ({
    getParameter: jest.fn().mockResolvedValue({ Parameter: { Value: 'mux-token-secret' } }),
    listTagsForResource: jest.fn().mockResolvedValue({
      TagList: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
    }),
  }) as unknown as SSM;

const activeStream = jest.fn().mockResolvedValue(
  success({
    state: 'active' as const,
    streamURL: 'https://stream.mux.com/playback-id.m3u8',
  }),
);

describe('makeGetStreamStateFromSSMAndMux', () => {
  beforeEach(() => activeStream.mockClear());

  it('includes the room Mux Data environment key in stream state', async () => {
    const getState = makeGetStreamStateFromSSMAndMux(
      makeSSM({
        'multiview:title': 'Ballroom 1',
        'multiview:data-env-key': 'data-environment-key',
      }),
      activeStream,
    );

    const result = await getState('room-id');

    expect(isSuccess(result)).toBe(true);
    expect(successValue(result)).toEqual({
      state: 'active',
      streamURL: 'https://stream.mux.com/playback-id.m3u8',
      title: 'Ballroom 1',
      muxDataEnvironmentKey: 'data-environment-key',
    });
  });

  it('omits an absent Mux Data environment key', async () => {
    const getState = makeGetStreamStateFromSSMAndMux(makeSSM({ 'multiview:title': 'Ballroom 1' }), activeStream);

    const result = await getState('room-id');

    expect(isSuccess(result)).toBe(true);
    expect(successValue(result)).toEqual({
      state: 'active',
      streamURL: 'https://stream.mux.com/playback-id.m3u8',
      title: 'Ballroom 1',
    });
  });
});
