import { prepareAttachedMedia } from './prepareAttachedMedia';

describe('prepareAttachedMedia', () => {
  it('shows the mute overlay before starting muted playback', async () => {
    const remove = jest.fn();
    const play = jest.fn().mockResolvedValue(undefined);
    const muteOverlay = { classList: { remove } } as unknown as HTMLDivElement;
    const video = { muted: false, play } as unknown as HTMLVideoElement;

    await prepareAttachedMedia(video, muteOverlay);

    expect(remove).toHaveBeenCalledWith('hidden');
    expect(video.muted).toBe(true);
    expect(play).toHaveBeenCalled();
  });

  it('handles a rejected playback attempt', async () => {
    const error = new Error('Playback was interrupted');
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const muteOverlay = { classList: { remove: jest.fn() } } as unknown as HTMLDivElement;
    const video = { muted: false, play: jest.fn().mockRejectedValue(error) } as unknown as HTMLVideoElement;

    await expect(prepareAttachedMedia(video, muteOverlay)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Unable to resume muted playback after media attach', error);
    warn.mockRestore();
  });
});
