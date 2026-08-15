/** @see {isMuxWebhookBody} ts-auto-guard:type-guard */
export interface MuxWebhookBody {
  type: string;
}

/** @see {isDecodedJWT} ts-auto-guard:type-guard */
export interface DecodedJWT {
  iss: string;
  aud: string;
  sub: string;
  role: string;
}

/** @see {isAdminTagEditRequest} ts-auto-guard:type-guard */
export interface AdminTagEditRequest {
  title?: string;
  order?: string | number;
  show?: boolean;
  demo?: string | null;
}
