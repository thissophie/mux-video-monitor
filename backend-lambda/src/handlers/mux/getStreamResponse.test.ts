import { getStreamResponse } from './getStreamResponse';

describe('getStreamResponse', () => {
  it('returns Mux Data configuration for an active stream', () => {
    expect(
      getStreamResponse({
        state: 'active',
        streamURL: 'https://stream.mux.com/playback-id.m3u8',
        title: 'Ballroom 1',
        muxDataEnvironmentKey: 'data-environment-key',
      }),
    ).toEqual({
      ok: true,
      online: true,
      stream: 'https://stream.mux.com/playback-id.m3u8',
      title: 'Ballroom 1',
      muxDataEnvironmentKey: 'data-environment-key',
    });
  });

  it('omits missing Mux Data configuration from JSON', () => {
    const body = JSON.parse(JSON.stringify(getStreamResponse({ state: 'not-active', title: 'Ballroom 1' })));

    expect(body).toEqual({ ok: true, online: false, stream: false, title: 'Ballroom 1' });
  });
});
