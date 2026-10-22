export type AdminInfoResponse = {
  num_users: number;
  num_disabled_users: number;
  total_disk_used_mb: number;
  num_signup_codes: number;
  num_unused_signup_codes: number;
  public_key?: string;
  pkarr_pubky_address?: string;
  pkarr_icann_domain?: string;
  version?: string;
  // Legacy field for backward compatibility
  pubkey?: string;
};

export type DeleteUrlRequest = { path: string };
export type DisableUserRequest = { pubkey: string };
export type DisabledUser = { pubkey: string };
export type DisabledUsersResponse = {
  items: DisabledUser[];
  next_cursor: string | null;
};
export type GenerateInviteResponse = { token: string };

/** Admin `GET /signup_tokens` (pubky-homeserver 0.14+). Timestamps are UTC without a zone. */
export type SignupTokenState = 'unused' | 'used' | 'all';
export type SignupToken = {
  token: string;
  created_at: string;
  used_at: string | null;
  used_by: string | null;
  /** The limits the code carries, as given when it was created; empty = the homeserver's defaults. Reported by homeservers after 0.16.2. */
  quota?: UserQuota;
};
export type SignupTokensResponse = {
  items: SignupToken[];
  next_cursor: string | null;
};

/**
 * Per-user quota (admin `GET|PATCH /users/{pubkey}/quota`, pubky-homeserver
 * 0.16+). A field missing from `overrides` follows the homeserver default;
 * `effective` omits a field that resolves to no limit.
 */
export type UserQuota = {
  storage_quota_mb?: number | 'unlimited';
  rate_read?: string;
  rate_write?: string;
  rate_read_burst?: number;
  rate_write_burst?: number;
  /** Missing = writes anywhere; [] = read-only. */
  allowed_write_paths?: string[];
};
export type UserQuotaResponse = {
  effective: UserQuota;
  overrides: UserQuota;
  /** Whether the account is disabled. Not reported by homeservers up to 0.16; a later one may add it. */
  disabled?: boolean;
};
/** Fields sent are changed; null hands a field back to the homeserver default. */
export type UserQuotaPatch = { [K in keyof UserQuota]?: UserQuota[K] | null };
