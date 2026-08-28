export const prepareAttachedMedia = (video: HTMLVideoElement, muteOverlay: HTMLDivElement) => {
  muteOverlay.classList.remove('hidden');
  video.muted = true;
  void video.play();
};
