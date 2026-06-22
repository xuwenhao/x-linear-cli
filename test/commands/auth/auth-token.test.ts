import { assertEquals } from "@std/assert"
import { setCliWorkspace } from "../../../src/config.ts"
import { tokenCommand } from "../../../src/commands/auth/auth-token.ts"
import {
  clearTokenCache,
  getClientCredentialsToken,
  resetTokenCache,
} from "../../../src/utils/oauth.ts"

Deno.test("auth token - forces a fresh token in client-credentials mode", async () => {
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

  let mints = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() => {
    mints++
    return Promise.resolve(
      new Response(
        JSON.stringify({ access_token: `tok-${mints}`, expires_in: 3600 }),
        { status: 200 },
      ),
    )
  }) as typeof fetch

  const logs: string[] = []
  const originalLog = console.log
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "))
  }

  try {
    // Prime the cache (mint #1) — a normal command would reuse this.
    await getClientCredentialsToken()
    assertEquals(mints, 1)

    // `auth token` must not hand out the cached token; it evicts + re-mints.
    await tokenCommand.parse([])
    assertEquals(mints, 2)
    assertEquals(logs.at(-1), "Bearer tok-2")
  } finally {
    console.log = originalLog
    globalThis.fetch = originalFetch
    await clearTokenCache()
    await Deno.remove(dir, { recursive: true }).catch(() => {})
    Deno.env.delete("LINEAR_TOKEN_CACHE_DIR")
    Deno.env.delete("LINEAR_CLIENT_ID")
    Deno.env.delete("LINEAR_CLIENT_SECRET")
    resetTokenCache()
  }
})
