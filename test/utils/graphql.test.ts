import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert"
import { setCliWorkspace } from "../../src/config.ts"
import {
  getAuthMode,
  getResolvedApiKey,
  resolveAuthorization,
} from "../../src/utils/graphql.ts"
import { resetTokenCache } from "../../src/utils/oauth.ts"

function clearAuthEnv() {
  Deno.env.delete("LINEAR_ACCESS_TOKEN")
  Deno.env.delete("LINEAR_CLIENT_ID")
  Deno.env.delete("LINEAR_CLIENT_SECRET")
  Deno.env.delete("LINEAR_API_KEY")
  setCliWorkspace(undefined)
  resetTokenCache()
}

Deno.test("getResolvedApiKey - errors when --workspace not found in credentials", () => {
  // Setup - use a workspace name that definitely doesn't exist
  Deno.env.delete("LINEAR_API_KEY")
  setCliWorkspace("nonexistent-workspace-xyz-123")

  try {
    const error = assertThrows(
      () => getResolvedApiKey(),
      Error,
    )
    assertStringIncludes(
      error.message,
      'Workspace "nonexistent-workspace-xyz-123" not found in credentials',
    )
  } finally {
    // Cleanup
    setCliWorkspace(undefined)
  }
})

Deno.test("getResolvedApiKey - errors when LINEAR_API_KEY and --workspace both set", () => {
  // Setup
  Deno.env.set("LINEAR_API_KEY", "test-api-key")
  setCliWorkspace("test-workspace")

  try {
    assertThrows(
      () => getResolvedApiKey(),
      Error,
      "Cannot use --workspace flag when LINEAR_API_KEY environment variable is set",
    )
  } finally {
    // Cleanup
    Deno.env.delete("LINEAR_API_KEY")
    setCliWorkspace(undefined)
  }
})

Deno.test("getResolvedApiKey - returns LINEAR_API_KEY when set without --workspace", () => {
  // Setup
  Deno.env.set("LINEAR_API_KEY", "test-api-key")
  setCliWorkspace(undefined)

  try {
    const result = getResolvedApiKey()
    assertEquals(result, "test-api-key")
  } finally {
    // Cleanup
    Deno.env.delete("LINEAR_API_KEY")
  }
})

Deno.test("getAuthMode - access token takes precedence over client creds and api key", () => {
  clearAuthEnv()
  Deno.env.set("LINEAR_ACCESS_TOKEN", "tok")
  Deno.env.set("LINEAR_CLIENT_ID", "id")
  Deno.env.set("LINEAR_CLIENT_SECRET", "secret")
  Deno.env.set("LINEAR_API_KEY", "key")
  try {
    assertEquals(getAuthMode(), "access-token")
  } finally {
    clearAuthEnv()
  }
})

Deno.test("getAuthMode - client credentials take precedence over api key", () => {
  clearAuthEnv()
  Deno.env.set("LINEAR_CLIENT_ID", "id")
  Deno.env.set("LINEAR_CLIENT_SECRET", "secret")
  Deno.env.set("LINEAR_API_KEY", "key")
  try {
    assertEquals(getAuthMode(), "client-credentials")
  } finally {
    clearAuthEnv()
  }
})

Deno.test("getAuthMode - api key when only LINEAR_API_KEY is set", () => {
  clearAuthEnv()
  Deno.env.set("LINEAR_API_KEY", "key")
  try {
    assertEquals(getAuthMode(), "api-key")
  } finally {
    clearAuthEnv()
  }
})

Deno.test("resolveAuthorization - access token is sent as Bearer", async () => {
  clearAuthEnv()
  Deno.env.set("LINEAR_ACCESS_TOKEN", "abc123")
  try {
    assertEquals(await resolveAuthorization(), "Bearer abc123")
  } finally {
    clearAuthEnv()
  }
})

Deno.test("resolveAuthorization - api key is sent raw (no Bearer prefix)", async () => {
  clearAuthEnv()
  Deno.env.set("LINEAR_API_KEY", "lin_api_rawkey")
  try {
    assertEquals(await resolveAuthorization(), "lin_api_rawkey")
  } finally {
    clearAuthEnv()
  }
})

Deno.test("resolveAuthorization - client credentials exchanged then sent as Bearer", async () => {
  clearAuthEnv()
  Deno.env.set("LINEAR_CLIENT_ID", "id")
  Deno.env.set("LINEAR_CLIENT_SECRET", "secret")

  const original = globalThis.fetch
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ access_token: "exchanged-token", expires_in: 3600 }),
        { status: 200 },
      ),
    )) as typeof fetch

  try {
    assertEquals(await resolveAuthorization(), "Bearer exchanged-token")
  } finally {
    globalThis.fetch = original
    clearAuthEnv()
  }
})
