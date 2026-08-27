import { createMuxDataMonitor, MuxDataClient } from './muxData';

const video = {} as HTMLVideoElement;
const hls = {};
const Hls = function Hls() {};

const makeClient = (): jest.Mocked<MuxDataClient> => ({
  monitor: jest.fn(),
  emit: jest.fn(),
  updateData: jest.fn(),
});

describe('createMuxDataMonitor', () => {
  it('does not monitor a room without a Mux Data environment key', () => {
    const client = makeClient();
    const monitor = createMuxDataMonitor(client, video, hls, Hls, 123);

    monitor.track({ roomId: 'room-1', title: 'Ballroom 1', streamURL: 'https://stream.example/one.m3u8' });

    expect(client.monitor).not.toHaveBeenCalled();
  });

  it('attaches Mux Data to the existing hls.js player', () => {
    const client = makeClient();
    const monitor = createMuxDataMonitor(client, video, hls, Hls, 123);

    monitor.track({
      roomId: 'room-1',
      title: 'Ballroom 1',
      streamURL: 'https://stream.example/one.m3u8',
      muxDataEnvironmentKey: 'environment-key',
    });

    expect(client.monitor).toHaveBeenCalledWith(video, {
      hlsjs: hls,
      Hls,
      data: {
        env_key: 'environment-key',
        player_init_time: 123,
        player_name: 'NDV attendee hls.js player',
        video_id: 'room-1',
        video_is_live: true,
        video_stream_type: 'live',
        video_title: 'Ballroom 1',
      },
    });
  });

  it('does not create a new view when the same source is retried', () => {
    const client = makeClient();
    const monitor = createMuxDataMonitor(client, video, hls, Hls, 123);
    const stream = {
      roomId: 'room-1',
      title: 'Ballroom 1',
      streamURL: 'https://stream.example/one.m3u8',
      muxDataEnvironmentKey: 'environment-key',
    };

    monitor.track(stream);
    monitor.track(stream);

    expect(client.monitor).toHaveBeenCalledTimes(1);
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('starts a new view when the HLS source changes', () => {
    const client = makeClient();
    const monitor = createMuxDataMonitor(client, video, hls, Hls, 123);

    monitor.track({
      roomId: 'room-1',
      title: 'Ballroom 1',
      streamURL: 'https://stream.example/one.m3u8',
      muxDataEnvironmentKey: 'environment-key',
    });
    monitor.track({
      roomId: 'room-1',
      title: 'Ballroom 1',
      streamURL: 'https://stream.example/two.m3u8',
      muxDataEnvironmentKey: 'environment-key',
    });

    expect(client.emit).toHaveBeenCalledWith(video, 'videochange', {
      video_id: 'room-1',
      video_is_live: true,
      video_stream_type: 'live',
      video_title: 'Ballroom 1',
    });
  });

  it('updates a changed room title without creating a new view', () => {
    const client = makeClient();
    const monitor = createMuxDataMonitor(client, video, hls, Hls, 123);

    monitor.track({
      roomId: 'room-1',
      title: 'Ballroom 1',
      streamURL: 'https://stream.example/one.m3u8',
      muxDataEnvironmentKey: 'environment-key',
    });
    monitor.track({
      roomId: 'room-1',
      title: 'Main Hall',
      streamURL: 'https://stream.example/one.m3u8',
      muxDataEnvironmentKey: 'environment-key',
    });

    expect(client.updateData).toHaveBeenCalledWith(video, { video_title: 'Main Hall' });
    expect(client.emit).not.toHaveBeenCalled();
  });
});
