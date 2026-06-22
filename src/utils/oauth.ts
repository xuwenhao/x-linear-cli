import { ensureDir } from "@std/fs"
import { dirname, join } from "@std/path"
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

/**
 * Whether exactly one of LINEAR_CLIENT_ID / LINEAR_CLIENT_SECRET is set. This is
 * almost always a misconfiguration: callers should treat it as an error rather
 * than silently falling back to a personal API key (which would run as a human
 * user instead of the intended bot).
 */
export function hasPartialClientCredentials(): boolean {
  const hasId = Boolean(Deno.env.get("LINEAR_CLIENT_ID"))
  const hasSecret = Boolean(Deno.env.get("LINEAR_CLIENT_SECRET"))
  return hasId !== hasSecret
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

// ── Cross-process disk cache ─────────────────────────────────────────────
//
// CLI invocations are short-lived, so the in-memory cache above only helps
// within a single command. To avoid a token exchange on every command, the
// access token is also cached on disk (keyed by client id + scopes) until
// shortly before it expires. Only the access token is stored — never the
// client secret. Disable with LINEAR_NO_TOKEN_CACHE=1.

const TOKEN_CACHE_VERSION = 1

interface DiskTokenEntry {
  accessToken: string
  expiresAtMs: number
}

interface DiskTokenCache {
  version: number
  entries: Record<string, DiskTokenEntry>
}

/**
 * Path to the on-disk token cache, following the XDG cache spec on Unix and
 * LOCALAPPDATA on Windows. Returns null when caching is disabled or no suitable
 * directory is available. Override the directory with LINEAR_TOKEN_CACHE_DIR.
 */
export function getTokenCachePath(): string | null {
  if (Deno.env.get("LINEAR_NO_TOKEN_CACHE")) return null

  const override = Deno.env.get("LINEAR_TOKEN_CACHE_DIR")
  if (override) return join(override, "token-cache.json")

  if (Deno.build.os === "windows") {
    const base = Deno.env.get("LOCALAPPDATA") || Deno.env.get("APPDATA")
    if (base) return join(base, "linear", "token-cache.json")
  } else {
    const xdgCacheHome = Deno.env.get("XDG_CACHE_HOME")
    const homeDir = Deno.env.get("HOME")
    if (xdgCacheHome) return join(xdgCacheHome, "linear", "token-cache.json")
    if (homeDir) return join(homeDir, ".cache", "linear", "token-cache.json")
  }
  return null
}

async function readDiskCacheFile(path: string): Promise<DiskTokenCache | null> {
  try {
    const parsed = JSON.parse(await Deno.readTextFile(path)) as DiskTokenCache
    if (parsed && typeof parsed === "object" && parsed.entries) return parsed
  } catch {
    // Missing or corrupt cache file — treat as empty.
  }
  return null
}

async function readDiskToken(cacheKey: string): Promise<DiskTokenEntry | null> {
  const path = getTokenCachePath()
  if (!path) return null
  const entry = (await readDiskCacheFile(path))?.entries?.[cacheKey]
  if (
    entry && typeof entry.accessToken === "string" &&
    typeof entry.expiresAtMs === "number"
  ) {
    return entry
  }
  return null
}

async function writeDiskToken(
  cacheKey: string,
  siblingPrefix: string,
  entry: DiskTokenEntry,
): Promise<void> {
  const path = getTokenCachePath()
  if (!path) return
  try {
    const cache = (await readDiskCacheFile(path)) ??
      { version: TOKEN_CACHE_VERSION, entries: {} }
    cache.version = TOKEN_CACHE_VERSION
    // Drop other cached tokens for the same client+secret (e.g. a previous
    // scope set). Linear revokes prior client-credentials tokens, so keeping
    // them would risk serving a revoked token if the scopes change back.
    for (const key of Object.keys(cache.entries)) {
      if (key !== cacheKey && key.startsWith(siblingPrefix)) {
        delete cache.entries[key]
      }
    }
    cache.entries[cacheKey] = entry
    await ensureDir(dirname(path))
    // mode is honored on Unix and ignored on Windows; chmod afterwards in case
    // the file already existed with looser permissions.
    await Deno.writeTextFile(path, JSON.stringify(cache), { mode: 0o600 })
    if (Deno.build.os !== "windows") {
      try {
        await Deno.chmod(path, 0o600)
      } catch {
        // Best-effort.
      }
    }
  } catch {
    // Caching is best-effort; never fail a command because we couldn't persist.
  }
}

/** Remove the on-disk token cache. Clears the in-memory cache too. */
export async function clearTokenCache(): Promise<void> {
  cachedToken = null
  const path = getTokenCachePath()
  if (!path) return
  try {
    await Deno.remove(path)
  } catch {
    // Nothing to remove.
  }
}

/**
 * Short, non-reversible fingerprint of a value (first 8 bytes of its SHA-256).
 * Used to scope cached tokens to a specific client secret without storing it.
 */
async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Exchange client credentials for an app access token, caching it in memory
 * and on disk until shortly before it expires.
 */
export async function getClientCredentialsToken(): Promise<string> {
  const creds = getClientCredentials()
  if (!creds) {
    throw new Error(
      "LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET are required for client-credentials auth.",
    )
  }

  const scope = getResolvedScopes()
  // Scope tokens to client id + a fingerprint of the secret, so rotating the
  // secret (which revokes existing tokens) doesn't keep serving a stale token.
  const keyPrefix = `${creds.clientId}:${await fingerprint(
    creds.clientSecret,
  )}:`
  const cacheKey = `${keyPrefix}${scope}`
  const now = Date.now()

  // L1: in-memory cache (same process).
  if (
    cachedToken &&
    cachedToken.cacheKey === cacheKey &&
    cachedToken.expiresAtMs > now + TOKEN_EXPIRY_SKEW_MS
  ) {
    return cachedToken.accessToken
  }

  // L2: on-disk cache (across processes).
  const disk = await readDiskToken(cacheKey)
  if (disk && disk.expiresAtMs > now + TOKEN_EXPIRY_SKEW_MS) {
    cachedToken = {
      cacheKey,
      accessToken: disk.accessToken,
      expiresAtMs: disk.expiresAtMs,
    }
    return disk.accessToken
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

  const expiresAtMs = now + (json.expires_in ?? 3600) * 1000
  cachedToken = { cacheKey, accessToken: json.access_token, expiresAtMs }
  await writeDiskToken(cacheKey, keyPrefix, {
    accessToken: json.access_token,
    expiresAtMs,
  })
  return json.access_token
}
