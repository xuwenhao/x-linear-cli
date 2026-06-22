import { assertEquals } from "@std/assert"
import { setCliWorkspace } from "../../src/config.ts"
import { authorizedFetch } from "../../src/utils/graphql.ts"
import { clearTokenCache, resetTokenCache } from "../../src/utils/oauth.ts"

Deno.test("authorizedFetch - evicts cached bot token and retries once on 401", async () => {
  const dir = await Deno.makeTempDir()
  Deno.env.set("LINEAR_TOKEN_CACHE_DIR", dir)
  Deno.env.delete("LINEAR_NO_TOKEN_CACHE")
  Deno.env.delete("LINEAR_ACCESS_TOKEN")
  Deno.env.delete("LINEAR_API_KEY")
  Deno.env.set("LINEAR_CLIENT_ID", "id")
  Deno.env.set("LINEAR_CLIENT_SECRET", "secret")
  Deno.env.delete("LINEAR_OAUTH_SCOPES")
  setCliWorkspace(undefined)
  resetTokenCache()

  let tokenMints = 0
  let apiCalls = 0
  const sentAuth: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString()
    if (url.includes("/oauth/token")) {
      tokenMints++
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: `tok-${tokenMints}`,
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      )
    }
    apiCalls++
    sentAuth.push(new Headers(init?.headers).get("Authorization") ?? "")
    // First request 401 (revoked token); retry succeeds.
    return Promise.resolve(
      new Response("", { status: apiCalls === 1 ? 401 : 200 }),
    )
  }) as typeof fetch

  try {
    const res = await authorizedFetch("https://example.test/graphql", {
      method: "POST",
    })
    assertEquals(res.status, 200)
    assertEquals(apiCalls, 2) // initial + one retry
    assertEquals(tokenMints, 2) // initial mint + re-mint after eviction
    assertEquals(sentAuth[0], "Bearer tok-1")
    assertEquals(sentAuth[1], "Bearer tok-2") // fresh token on the retry
  } finally {
    globalThis.fetch = original
    await clearTokenCache()
    await Deno.remove(dir, { recursive: true }).catch(() => {})
    Deno.env.delete("LINEAR_TOKEN_CACHE_DIR")
    Deno.env.delete("LINEAR_CLIENT_ID")
    Deno.env.delete("LINEAR_CLIENT_SECRET")
    resetTokenCache()
  }
})

Deno.test("authorizedFetch - does not retry a 401 in API-key mode", async () => {
  Deno.env.delete("LINEAR_ACCESS_TOKEN")
  Deno.env.delete("LINEAR_CLIENT_ID")
  Deno.env.delete("LINEAR_CLIENT_SECRET")
  Deno.env.set("LINEAR_API_KEY", "lin_api_key")
  Deno.env.set("LINEAR_NO_TOKEN_CACHE", "1")
  setCliWorkspace(undefined)

  let apiCalls = 0
  const original = globalThis.fetch
  globalThis.fetch = (() => {
    apiCalls++
    return Promise.resolve(new Response("", { status: 401 }))
  }) as typeof fetch

  try {
    const res = await authorizedFetch("https://example.test/graphql")
    assertEquals(res.status, 401)
    assertEquals(apiCalls, 1) // no token to refresh → no retry
  } finally {
    globalThis.fetch = original
    Deno.env.delete("LINEAR_API_KEY")
    Deno.env.delete("LINEAR_NO_TOKEN_CACHE")
  }
})
