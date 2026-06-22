import { assertEquals } from "@std/assert"
import { join } from "@std/path"
import {
  clearTokenCache,
  getClientCredentialsToken,
  resetTokenCache,
} from "../../src/utils/oauth.ts"

function mockTokenFetch(token: string, expiresIn: number) {
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (() => {
    calls++
    return Promise.resolve(
      new Response(
        JSON.stringify({ access_token: token, expires_in: expiresIn }),
        { status: 200 },
      ),
    )
  }) as typeof fetch
  return {
    calls: () => calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

async function withCacheDir(
  clientId: string,
  fn: (dir: string) => Promise<void>,
  opts: { disabled?: boolean } = {},
) {
  const dir = await Deno.makeTempDir()
  Deno.env.set("LINEAR_TOKEN_CACHE_DIR", dir)
  if (opts.disabled) Deno.env.set("LINEAR_NO_TOKEN_CACHE", "1")
  else Deno.env.delete("LINEAR_NO_TOKEN_CACHE")
  Deno.env.set("LINEAR_CLIENT_ID", clientId)
  Deno.env.set("LINEAR_CLIENT_SECRET", "secret")
  Deno.env.delete("LINEAR_OAUTH_SCOPES")
  resetTokenCache()
  try {
    await fn(dir)
  } finally {
    await clearTokenCache()
    await Deno.remove(dir, { recursive: true }).catch(() => {})
    Deno.env.delete("LINEAR_TOKEN_CACHE_DIR")
    Deno.env.delete("LINEAR_NO_TOKEN_CACHE")
    Deno.env.delete("LINEAR_CLIENT_ID")
    Deno.env.delete("LINEAR_CLIENT_SECRET")
    resetTokenCache()
  }
}

Deno.test("disk cache - token is reused across processes", async () => {
  await withCacheDir("reuse-id", async () => {
    const f = mockTokenFetch("disk-token", 3600)
    try {
      assertEquals(await getClientCredentialsToken(), "disk-token")
      assertEquals(f.calls(), 1)

      // Simulate a fresh CLI process: only the in-memory cache is cleared.
      resetTokenCache()

      assertEquals(await getClientCredentialsToken(), "disk-token")
      assertEquals(f.calls(), 1) // served from disk, no new token exchange
    } finally {
      f.restore()
    }
  })
})

Deno.test("disk cache - rotating the client secret triggers a fresh exchange", async () => {
  const dir = await Deno.makeTempDir()
  Deno.env.set("LINEAR_TOKEN_CACHE_DIR", dir)
  Deno.env.delete("LINEAR_NO_TOKEN_CACHE")
  Deno.env.set("LINEAR_CLIENT_ID", "rotate-id")
  Deno.env.set("LINEAR_CLIENT_SECRET", "secret-v1")
  Deno.env.delete("LINEAR_OAUTH_SCOPES")
  resetTokenCache()
  const f = mockTokenFetch("tok", 3600)
  try {
    await getClientCredentialsToken()
    assertEquals(f.calls(), 1)

    // Same secret across a fresh process → served from disk.
    resetTokenCache()
    await getClientCredentialsToken()
    assertEquals(f.calls(), 1)

    // Rotate the secret → different fingerprint in the cache key → new exchange.
    Deno.env.set("LINEAR_CLIENT_SECRET", "secret-v2")
    resetTokenCache()
    await getClientCredentialsToken()
    assertEquals(f.calls(), 2)
  } finally {
    f.restore()
    await clearTokenCache()
    await Deno.remove(dir, { recursive: true }).catch(() => {})
    Deno.env.delete("LINEAR_TOKEN_CACHE_DIR")
    Deno.env.delete("LINEAR_CLIENT_ID")
    Deno.env.delete("LINEAR_CLIENT_SECRET")
    resetTokenCache()
  }
})

Deno.test("disk cache - expired disk token triggers a fresh exchange", async () => {
  await withCacheDir("expired-id", async () => {
    const f = mockTokenFetch("old-token", 0) // already within the skew window
    try {
      assertEquals(await getClientCredentialsToken(), "old-token")
      assertEquals(f.calls(), 1)

      resetTokenCache()

      assertEquals(await getClientCredentialsToken(), "old-token")
      assertEquals(f.calls(), 2) // expired on disk → exchanged again
    } finally {
      f.restore()
    }
  })
})

Deno.test("disk cache - LINEAR_NO_TOKEN_CACHE disables persistence", async () => {
  await withCacheDir("disabled-id", async () => {
    const f = mockTokenFetch("nocache-token", 3600)
    try {
      assertEquals(await getClientCredentialsToken(), "nocache-token")
      assertEquals(f.calls(), 1)

      resetTokenCache()

      assertEquals(await getClientCredentialsToken(), "nocache-token")
      assertEquals(f.calls(), 2) // nothing persisted, so a new exchange happens
    } finally {
      f.restore()
    }
  }, { disabled: true })
})

Deno.test({
  name: "disk cache - file is written with 0600 permissions",
  ignore: Deno.build.os === "windows",
  fn: async () => {
    await withCacheDir("perms-id", async (dir) => {
      const f = mockTokenFetch("perm-token", 3600)
      try {
        await getClientCredentialsToken()
        const info = await Deno.stat(join(dir, "token-cache.json"))
        assertEquals((info.mode ?? 0) & 0o777, 0o600)
      } finally {
        f.restore()
      }
    })
  },
})
