interface MuxVideoMetadata {
  video_id: string;
  video_is_live: true;
  video_stream_type: 'live';
  video_title: string;
}

interface MuxMonitorOptions {
  hlsjs: unknown;
  Hls: unknown;
  data: MuxVideoMetadata & {
    env_key: string;
    player_init_time: number;
    player_name: string;
  };
}

export interface MuxDataClient {
  monitor: (video: HTMLVideoElement, options: MuxMonitorOptions) => void;
  emit: (video: HTMLVideoElement, event: 'videochange', data: MuxVideoMetadata) => void;
  updateData: (video: HTMLVideoElement, data: Partial<MuxVideoMetadata>) => void;
}

interface MuxStream {
  roomId: string;
  title: string;
  streamURL: string;
  muxDataEnvironmentKey?: string;
}

const metadataFor = ({ roomId, title }: MuxStream): MuxVideoMetadata => ({
  video_id: roomId,
  video_is_live: true,
  video_stream_type: 'live',
  video_title: title,
});

export const createMuxDataMonitor = (
  client: MuxDataClient,
  video: HTMLVideoElement,
  hlsjs: unknown,
  Hls: unknown,
  playerInitTime: number,
) => {
  let monitored = false;
  let currentStreamURL: string | undefined;
  let currentTitle: string | undefined;

  const track = (stream: MuxStream): void => {
    const metadata = metadataFor(stream);

    if (!monitored) {
      if (!stream.muxDataEnvironmentKey) {
        return;
      }

      client.monitor(video, {
        hlsjs,
        Hls,
        data: {
          env_key: stream.muxDataEnvironmentKey,
          player_init_time: playerInitTime,
          player_name: 'NDV attendee hls.js player',
          ...metadata,
        },
      });
      monitored = true;
      currentStreamURL = stream.streamURL;
      currentTitle = stream.title;
      return;
    }

    if (stream.streamURL !== currentStreamURL) {
      client.emit(video, 'videochange', metadata);
      currentStreamURL = stream.streamURL;
      currentTitle = stream.title;
      return;
    }

    if (stream.title !== currentTitle) {
      client.updateData(video, { video_title: stream.title });
      currentTitle = stream.title;
    }
  };

  return { track };
};
