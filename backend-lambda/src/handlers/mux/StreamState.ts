export interface StreamInactive {
  state: 'not-active';
}

export interface StreamActive {
  state: 'active';
  streamURL: string;
}

export type StreamState = StreamInactive | StreamActive;

export type StreamStateWithTitle = StreamState & {
  title: string;
  muxDataEnvironmentKey?: string;
};

export type StreamStateDocument = {
  CacheKind: 'stream';
  CacheKey: string;
  LastUpdated: number;
  State: StreamStateWithTitle;
};
