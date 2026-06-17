import { Command } from "@cliffy/command"
import { AuthError, handleError } from "../../utils/errors.ts"
import { getAuthMode, getResolvedApiKey } from "../../utils/graphql.ts"
import { getClientCredentialsToken } from "../../utils/oauth.ts"

export const tokenCommand = new Command()
  .name("token")
  .description("Print the configured token (API key, or OAuth access token)")
  .action(async () => {
    try {
      const mode = getAuthMode()

      // For OAuth app (bot) auth, print the access token so it can be reused
      // (e.g. `Authorization: Bearer <token>` with curl).
      if (mode === "client-credentials") {
        console.log(await getClientCredentialsToken())
        return
      }
      if (mode === "access-token") {
        console.log(Deno.env.get("LINEAR_ACCESS_TOKEN"))
        return
      }

      const apiKey = getResolvedApiKey()
      if (apiKey) {
        console.log(apiKey)
      } else {
        throw new AuthError("No token configured", {
          suggestion:
            "Set LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET (bot), LINEAR_ACCESS_TOKEN, " +
            "LINEAR_API_KEY, add api_key to .linear.toml, or run `x-linear auth login`.",
        })
      }
    } catch (error) {
      handleError(error, "Failed to get token")
    }
  })
