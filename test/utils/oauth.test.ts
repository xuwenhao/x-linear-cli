import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert"
import {
  getClientCredentialsToken,
  getResolvedScopes,
  hasClientCredentials,
  resetTokenCache,
} from "../../src/utils/oauth.ts"

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) Deno.env.delete(key)
    else Deno.env.set(key, value)
  }
}

function bodyToString(body: BodyInit | null | undefined): string {
  if (body instanceof URLSearchParams) return body.toString()
  return String(body ?? "")
}

Deno.test("hasClientCredentials - true only when both id and secret set", () => {
  setEnv({ LINEAR_CLIENT_ID: undefined, LINEAR_CLIENT_SECRET: undefined })
  try {
    assertEquals(hasClientCredentials(), false)
    Deno.env.set("LINEAR_CLIENT_ID", "id")
    assertEquals(hasClientCredentials(), false)
    Deno.env.set("LINEAR_CLIENT_SECRET", "secret")
    assertEquals(hasClientCredentials(), true)
  } finally {
    setEnv({ LINEAR_CLIENT_ID: undefined, LINEAR_CLIENT_SECRET: undefined })
  }
})

Deno.test("getResolvedScopes - default and override", () => {
  setEnv({ LINEAR_OAUTH_SCOPES: undefined })
  try {
    assertEquals(
      getResolvedScopes(),
      "read,write,issues:create,comments:create",
    )
    Deno.env.set("LINEAR_OAUTH_SCOPES", "read")
    assertEquals(getResolvedScopes(), "read")
  } finally {
    setEnv({ LINEAR_OAUTH_SCOPES: undefined })
  }
})

Deno.test("getClientCredentialsToken - exchanges credentials via Basic auth", async () => {
  resetTokenCache()
  setEnv({
    LINEAR_CLIENT_ID: "test-client-id",
    LINEAR_CLIENT_SECRET: "test-client-secret",
    LINEAR_OAUTH_SCOPES: undefined,
    LINEAR_OAUTH_TOKEN_ENDPOINT: undefined,
  })

  let capturedUrl: string | undefined
  let capturedInit: RequestInit | undefined
  const original = globalThis.fetch
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = input.toString()
    capturedInit = init
    return Promise.resolve(
      new Response(
        JSON.stringify({
          access_token: "app-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
  }) as typeof fetch

  try {
    const token = await getClientCredentialsToken()
    assertEquals(token, "app-token")
    assertEquals(capturedUrl, "https://api.linear.app/oauth/token")
    assertEquals(capturedInit?.method, "POST")

    const headers = new Headers(capturedInit?.headers)
    assertEquals(
      headers.get("Authorization"),
      "Basic " + btoa("test-client-id:test-client-secret"),
    )
    assertStringIncludes(
      headers.get("Content-Type") ?? "",
      "application/x-www-form-urlencoded",
    )

    const body = bodyToString(capturedInit?.body as BodyInit | null | undefined)
    assertStringIncludes(body, "grant_type=client_credentials")
    assertStringIncludes(body, "scope=read")
  } finally {
    globalThis.fetch = original
    resetTokenCache()
    setEnv({ LINEAR_CLIENT_ID: undefined, LINEAR_CLIENT_SECRET: undefined })
  }
})

Deno.test("getClientCredentialsToken - caches the token across calls", async () => {
  resetTokenCache()
  setEnv({ LINEAR_CLIENT_ID: "id", LINEAR_CLIENT_SECRET: "secret" })

  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = (() => {
    calls++
    return Promise.resolve(
      new Response(
        JSON.stringify({ access_token: "cached-token", expires_in: 3600 }),
        { status: 200 },
      ),
    )
  }) as typeof fetch

  try {
    assertEquals(await getClientCredentialsToken(), "cached-token")
    assertEquals(await getClientCredentialsToken(), "cached-token")
    assertEquals(calls, 1)
  } finally {
    globalThis.fetch = original
    resetTokenCache()
    setEnv({ LINEAR_CLIENT_ID: undefined, LINEAR_CLIENT_SECRET: undefined })
  }
})

Deno.test("getClientCredentialsToken - throws on non-ok response", async () => {
  resetTokenCache()
  setEnv({ LINEAR_CLIENT_ID: "id", LINEAR_CLIENT_SECRET: "secret" })

  const original = globalThis.fetch
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response("nope", { status: 401 }),
    )) as typeof fetch

  try {
    await assertRejects(
      () => getClientCredentialsToken(),
      Error,
      "Linear OAuth token request failed (401)",
    )
  } finally {
    globalThis.fetch = original
    resetTokenCache()
    setEnv({ LINEAR_CLIENT_ID: undefined, LINEAR_CLIENT_SECRET: undefined })
  }
})
