interface SetTitleLabelArguments {
  loading?: boolean;
  live?: boolean;
  error?: string;
  room: string;
}

export const createSetTitleLabel =
  (el: HTMLElement, loadingPlaceholder = '...') =>
  ({ loading = false, room, error }: SetTitleLabelArguments): void => {
    let description = '';
    if (loading) {
      description = loadingPlaceholder;
    } else if (error) {
      description = `: ${error}`;
    }
    el.textContent = `${room}${description}`;
  };
