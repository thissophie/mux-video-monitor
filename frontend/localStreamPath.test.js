const localStreamPath = require('./localStreamPath');

describe('localStreamPath', () => {
  it.each(['/api/stream', '/api/stream/room-1'])('routes %s to the local SSM-backed API', (path) => {
    expect(localStreamPath(path)).toBe(true);
  });

  it.each(['/api/ably', '/api/admin/streams', '/api/streaming'])('leaves %s on the production proxy', (path) => {
    expect(localStreamPath(path)).toBe(false);
  });
});
