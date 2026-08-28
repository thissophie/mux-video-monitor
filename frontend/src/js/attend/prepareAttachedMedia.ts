export const prepareAttachedMedia = async (video: HTMLVideoElement, muteOverlay: HTMLDivElement) => {
  muteOverlay.classList.remove('hidden');
  video.muted = true;
  try {
    await video.play();
  } catch (error) {
    console.warn('Unable to resume muted playback after media attach', error);
  }
};
