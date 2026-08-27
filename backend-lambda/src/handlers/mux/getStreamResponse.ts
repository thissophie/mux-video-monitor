import { StreamStateWithTitle } from './StreamState';

export const getStreamResponse = (state: StreamStateWithTitle) => ({
  ok: true as const,
  online: state.state === 'active',
  stream: state.state === 'active' && state.streamURL,
  title: state.title,
  muxDataEnvironmentKey: state.muxDataEnvironmentKey,
});
