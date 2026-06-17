import {
  DEFAULT_LINEAR_OAUTH_SCOPES,
  LINEAR_OAUTH_TOKEN_ENDPOINT,
} from "../const.ts"

/**
 * Linear OAuth client-credentials authentication.
 *
 * Unlike a personal API key (which is always tied to a human Linear user), an
 * OAuth app authenticated via the `client_credentials` grant acts as the
 * application itself — i.e. a bot. Actions are attributed to the app rather than
 * to whoever created the credentials.
 *
 * Flow (see https://developers.linear.app/docs/oauth/authentication):
 *   POST https://api.linear.app/oauth/token
 *   Authorization: Basic base64(client_id:client_secret)
 *   Content-Type: application/x-www-form-urlencoded
 *   grant_type=client_credentials&scope=<scopes>
 * → { access_token, token_type: "Bearer", expires_in (~30d), scope }
 *
 * The returned access token is then sent to the GraphQL API as
 * `Authorization: Bearer <access_token>`.
 */

interface CachedToken {
  cacheKey: string
  accessToken: string
  expiresAtMs: number
}

let cachedToken: CachedToken | null = null

/** Refresh the token slightly before it actually expires. */
const TOKEN_EXPIRY_SKEW_MS = 60_000

export interface ClientCredentials {
  clientId: string
  clientSecret: string
}

/**
 * Read OAuth client credentials from the environment, if both are present.
 */
export function getClientCredentials(): ClientCredentials | undefined {
  const clientId = Deno.env.get("LINEAR_CLIENT_ID")
  const clientSecret = Deno.env.get("LINEAR_CLIENT_SECRET")
  if (clientId && clientSecret) {
    return { clientId, clientSecret }
  }
  return undefined
}

/** Whether client-credentials (bot) auth is configured. */
export function hasClientCredentials(): boolean {
  return getClientCredentials() !== undefined
}

/** The OAuth scopes that will be requested (overridable via env). */
export function getResolvedScopes(): string {
  return Deno.env.get("LINEAR_OAUTH_SCOPES") || DEFAULT_LINEAR_OAUTH_SCOPES
}

/** The OAuth token endpoint (overridable via env, mainly for tests). */
export function getOAuthTokenEndpoint(): string {
  return Deno.env.get("LINEAR_OAUTH_TOKEN_ENDPOINT") ||
    LINEAR_OAUTH_TOKEN_ENDPOINT
}

/** Clear the in-memory token cache. Intended for tests. */
export function resetTokenCache(): void {
  cachedToken = null
}

/**
 * Exchange client credentials for an app access token, caching it in memory
 * until shortly before it expires.
 */
export async function getClientCredentialsToken(): Promise<string> {
  const creds = getClientCredentials()
  if (!creds) {
    throw new Error(
      "LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET are required for client-credentials auth.",
    )
  }

  const scope = getResolvedScopes()
  const cacheKey = `${creds.clientId}:${scope}`
  const now = Date.now()
  if (
    cachedToken &&
    cachedToken.cacheKey === cacheKey &&
    cachedToken.expiresAtMs > now + TOKEN_EXPIRY_SKEW_MS
  ) {
    return cachedToken.accessToken
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope,
  })
  const basic = btoa(`${creds.clientId}:${creds.clientSecret}`)

  const res = await fetch(getOAuthTokenEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })
  if (!res.ok) {
    throw new Error(
      `Linear OAuth token request failed (${res.status}): ${await res.text()}`,
    )
  }

  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
  }
  if (!json.access_token) {
    throw new Error(
      "Linear OAuth token response did not include access_token.",
    )
  }

  cachedToken = {
    cacheKey,
    accessToken: json.access_token,
    expiresAtMs: now + (json.expires_in ?? 3600) * 1000,
  }
  return json.access_token
}
