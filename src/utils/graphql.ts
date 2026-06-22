import { ClientError, GraphQLClient } from "graphql-request"
import { gray, setColorEnabled } from "@std/fmt/colors"
import { getCliWorkspace, getOption } from "../config.ts"
import { getCredentialApiKey } from "../credentials.ts"
import denoConfig from "../../deno.json" with { type: "json" }
import { extractGraphQLMessage, isDebugMode } from "./errors.ts"
import { LINEAR_API_ENDPOINT } from "../const.ts"
import {
  getClientCredentialsToken,
  hasClientCredentials,
  hasPartialClientCredentials,
} from "./oauth.ts"

export { ClientError }

/** Product name sent in the User-Agent header. */
const USER_AGENT_PRODUCT = "x-linear-cli"

/**
 * How the CLI is authenticating:
 * - `access-token`: a pre-fetched OAuth access token (LINEAR_ACCESS_TOKEN)
 * - `client-credentials`: OAuth app / bot (LINEAR_CLIENT_ID + LINEAR_CLIENT_SECRET)
 * - `api-key`: a personal Linear API key (LINEAR_API_KEY / config / credentials)
 */
export type AuthMode = "access-token" | "client-credentials" | "api-key"

const NO_CREDENTIALS_MESSAGE =
  "No Linear credentials configured. Set LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET " +
  "to authenticate as an OAuth app (bot), or set LINEAR_ACCESS_TOKEN / LINEAR_API_KEY, " +
  "add api_key to .linear.toml, or run `x-linear auth login`."

const PARTIAL_CREDENTIALS_MESSAGE =
  "Incomplete OAuth credentials: set both LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET " +
  "(or unset both). Refusing to fall back to a personal API key for a bot command."

// Re-export error utilities for backward compatibility
export { isClientError } from "./errors.ts"

/**
 * Logs a GraphQL ClientError formatted for display to the user.
 * @deprecated Use handleError from errors.ts for consistent error handling
 */
export function logClientError(error: ClientError): void {
  const message = extractGraphQLMessage(error)
  console.error(`✗ ${message}\n`)

  // Only show query details in debug mode
  if (isDebugMode()) {
    setColorEnabled(Deno.stderr.isTerminal())

    const rawQuery = error.request?.query
    const query = typeof rawQuery === "string" ? rawQuery.trim() : rawQuery
    const vars = JSON.stringify(error.request?.variables, null, 2)

    console.error(gray(String(query)))
    console.error("")
    console.error(gray(vars))
  }
}

/**
 * Get the resolved API key following the precedence chain:
 * 1. LINEAR_API_KEY env var (conflicts with --workspace)
 * 2. api_key in project config
 * 3. --workspace flag → credentials lookup
 * 4. Project's workspace config → credentials lookup
 * 5. default workspace from credentials file
 */
export function getResolvedApiKey(): string | undefined {
  const cliWorkspace = getCliWorkspace()
  const envApiKey = Deno.env.get("LINEAR_API_KEY")

  // Error if both LINEAR_API_KEY and --workspace are set
  if (envApiKey && cliWorkspace) {
    throw new Error(
      "Cannot use --workspace flag when LINEAR_API_KEY environment variable is set. " +
        "Either unset LINEAR_API_KEY or remove the --workspace flag.",
    )
  }

  // 1: LINEAR_API_KEY env var
  if (envApiKey) {
    return envApiKey
  }

  // 2: api_key in project config
  const configApiKey = getOption("api_key")
  if (configApiKey) {
    return configApiKey
  }

  // 3: --workspace flag → credentials lookup
  if (cliWorkspace) {
    const key = getCredentialApiKey(cliWorkspace)
    if (key) return key
    // Explicit --workspace flag must match a configured workspace
    throw new Error(
      `Workspace "${cliWorkspace}" not found in credentials. ` +
        `Run \`linear auth login\` to add it, or \`linear auth list\` to see configured workspaces.`,
    )
  }

  // 4: Project's workspace config → credentials lookup
  const projectWorkspace = getOption("workspace")
  if (projectWorkspace) {
    const key = getCredentialApiKey(projectWorkspace)
    if (key) return key
  }

  // 5: Default workspace from credentials file
  return getCredentialApiKey()
}

/**
 * Get the GraphQL endpoint URL.
 */
export function getGraphQLEndpoint(): string {
  return Deno.env.get("LINEAR_GRAPHQL_ENDPOINT") || LINEAR_API_ENDPOINT
}

/**
 * Determine which authentication mode is currently configured, in precedence
 * order. Returns undefined when no credentials are configured at all.
 */
export function getAuthMode(): AuthMode | undefined {
  if (Deno.env.get("LINEAR_ACCESS_TOKEN")) return "access-token"
  if (hasClientCredentials()) return "client-credentials"
  try {
    if (getResolvedApiKey()) return "api-key"
  } catch {
    // A misconfigured API-key path (e.g. LINEAR_API_KEY + --workspace) still
    // signals api-key intent; let the real error surface when the key resolves.
    return "api-key"
  }
  return undefined
}

/** Human-readable description of an auth mode for status output. */
export function describeAuthMode(mode: AuthMode): string {
  switch (mode) {
    case "access-token":
      return "OAuth access token (bot)"
    case "client-credentials":
      return "OAuth client credentials (bot)"
    case "api-key":
      return "personal API key"
  }
}

/** Prefix an OAuth token with "Bearer " (idempotent). API keys are sent raw. */
function toBearer(token: string): string {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`
}

/**
 * Resolve the full Authorization header value, following the precedence chain:
 * 1. LINEAR_ACCESS_TOKEN     → "Bearer <token>"
 * 2. LINEAR_CLIENT_ID/SECRET → client-credentials exchange → "Bearer <token>"
 * 3. resolved API key        → raw key (no "Bearer" prefix)
 */
export async function resolveAuthorization(): Promise<string> {
  const accessToken = Deno.env.get("LINEAR_ACCESS_TOKEN")
  if (accessToken) {
    return toBearer(accessToken)
  }

  if (hasClientCredentials()) {
    return toBearer(await getClientCredentialsToken())
  }

  // Don't silently downgrade a half-configured bot to a personal API key.
  if (hasPartialClientCredentials()) {
    throw new Error(PARTIAL_CREDENTIALS_MESSAGE)
  }

  const apiKey = getResolvedApiKey()
  if (!apiKey) {
    throw new Error(NO_CREDENTIALS_MESSAGE)
  }
  return apiKey
}

/**
 * Create a GraphQL client with an explicit API key.
 * Use this when you need to validate a specific key (e.g., during auth login).
 * The key is sent raw (personal API keys are not bearer tokens).
 */
export function createGraphQLClient(apiKey: string): GraphQLClient {
  return new GraphQLClient(getGraphQLEndpoint(), {
    headers: {
      Authorization: apiKey,
      "User-Agent": `${USER_AGENT_PRODUCT}/${denoConfig.version}`,
    },
  })
}

export function getGraphQLClient(): GraphQLClient {
  // Fail fast with a helpful message rather than surfacing a confusing error
  // mid-request (or silently using an API key for a half-configured bot).
  if (hasPartialClientCredentials()) {
    throw new Error(PARTIAL_CREDENTIALS_MESSAGE)
  }
  if (getAuthMode() === undefined) {
    throw new Error(NO_CREDENTIALS_MESSAGE)
  }

  // The Authorization header is resolved per-request so the OAuth token
  // exchange (and its in-memory caching) can be awaited lazily.
  return new GraphQLClient(getGraphQLEndpoint(), {
    headers: {
      "User-Agent": `${USER_AGENT_PRODUCT}/${denoConfig.version}`,
    },
    requestMiddleware: async (request) => {
      const authorization = await resolveAuthorization()
      // `request.headers` exists at runtime, but graphql-request's middleware
      // type doesn't reliably expose it across Deno/TS versions — cast to read it.
      const headers = new Headers(
        (request as { headers?: HeadersInit }).headers,
      )
      headers.set("Authorization", authorization)
      return { ...request, headers }
    },
  })
}
