import { prepareAttachedMedia } from './prepareAttachedMedia';

describe('prepareAttachedMedia', () => {
  it('shows the mute overlay before starting muted playback', () => {
    const remove = jest.fn();
    const play = jest.fn().mockResolvedValue(undefined);
    const muteOverlay = { classList: { remove } } as unknown as HTMLDivElement;
    const video = { muted: false, play } as unknown as HTMLVideoElement;

    prepareAttachedMedia(video, muteOverlay);

    expect(remove).toHaveBeenCalledWith('hidden');
    expect(video.muted).toBe(true);
    expect(play).toHaveBeenCalled();
  });
});
