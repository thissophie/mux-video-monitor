export const TAG_TITLE = 'multiview:title';
export const TAG_ORDER = 'multiview:order';
export const TAG_SHOW = 'multiview:show';
export const TAG_DEMO = 'multiview:demo';

export type AdminTags = Record<string, string>;

/** One SSM parameter under /multiview/mux/. Never carries the parameter value. */
export interface AdminStream {
  id: string;
  tags: AdminTags;
}

/** Tags to write, and tag keys to delete. */
export interface TagEditPlan {
  set: AdminTags;
  remove: string[];
}
