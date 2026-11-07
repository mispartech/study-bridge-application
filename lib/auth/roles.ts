/** app_metadata can only be set with the service key, unlike user_metadata, which students can edit. */
export const isAdmin = (
  user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null | undefined
) => user?.app_metadata?.role === "admin"
