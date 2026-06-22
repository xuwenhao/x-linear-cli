import { Command } from "@cliffy/command"
import { AuthError, handleError } from "../../utils/errors.ts"
import { getAuthMode, getResolvedApiKey } from "../../utils/graphql.ts"
import {
  getClientCredentialsToken,
  hasPartialClientCredentials,
} from "../../utils/oauth.ts"

// The action is async because resolving an OAuth app token requires awaiting
// getClientCredentialsToken() (a network exchange) below.
export const tokenCommand = new Command()
  .name("token")
  .description("Print the configured token (API key, or OAuth access token)")
  .action(async () => {
    try {
      const mode = getAuthMode()

      // A pre-fetched access token has the highest precedence; print it before
      // anything else (so it works even if a stray LINEAR_CLIENT_ID is set).
      if (mode === "access-token") {
        console.log(Deno.env.get("LINEAR_ACCESS_TOKEN"))
        return
      }

      // A half-configured bot must not silently print a personal API key.
      if (hasPartialClientCredentials()) {
        throw new AuthError("Incomplete OAuth credentials", {
          suggestion:
            "Set both LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET, or unset both.",
        })
      }

      // For OAuth app (bot) auth, print the access token so it can be reused
      // (e.g. `Authorization: Bearer <token>` with curl).
      if (mode === "client-credentials") {
        const token = await getClientCredentialsToken()
        console.log(token)
        return
      }

      const apiKey = getResolvedApiKey()
      if (apiKey) {
        console.log(apiKey)
      } else {
        throw new AuthError("No token or API key configured", {
          suggestion:
            "Set LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET (bot), LINEAR_ACCESS_TOKEN, " +
            "LINEAR_API_KEY, add api_key to .linear.toml, or run `x-linear auth login`.",
        })
      }
    } catch (error) {
      handleError(error, "Failed to get token")
    }
  })
