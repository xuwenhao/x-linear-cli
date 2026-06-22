export const LINEAR_WEB_BASE_URL = "https://linear.app"
export const LINEAR_API_ENDPOINT = "https://api.linear.app/graphql"

/** OAuth token endpoint for the client-credentials grant (bot/app auth). */
export const LINEAR_OAUTH_TOKEN_ENDPOINT = "https://api.linear.app/oauth/token"
/** Default scopes requested when authenticating as an OAuth app via client credentials. */
export const DEFAULT_LINEAR_OAUTH_SCOPES =
  "read,write,issues:create,comments:create"

/** Requires auth to access. */
export const LINEAR_PRIVATE_UPLOAD_HOST = "uploads.linear.app"
export const LINEAR_PUBLIC_UPLOAD_HOST = "public.linear.app"

export const LINEAR_UPLOAD_HOSTNAMES: readonly string[] = [
  LINEAR_PRIVATE_UPLOAD_HOST,
  LINEAR_PUBLIC_UPLOAD_HOST,
]
