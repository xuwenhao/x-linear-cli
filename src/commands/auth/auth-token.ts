import { Command } from "@cliffy/command"
import { handleError } from "../../utils/errors.ts"
import { getAuthMode, resolveAuthorization } from "../../utils/graphql.ts"
import { evictClientCredentialsToken } from "../../utils/oauth.ts"

// The action is async because resolving an OAuth app token may require a
// network exchange (client-credentials) inside resolveAuthorization().
export const tokenCommand = new Command()
  .name("token")
  .description(
    "Print the Authorization header value (API key, or `Bearer <OAuth token>`)",
  )
  .action(async () => {
    try {
      // The printed value is typically used directly as an Authorization header
      // (e.g. `curl -H "Authorization: $(x-linear auth token)"`), an external
      // path with no 401 retry. For OAuth app auth, force a fresh token so we
      // never hand out a revoked cached one.
      if (getAuthMode() === "client-credentials") {
        await evictClientCredentialsToken()
      }

      // Emit the exact value to use as the Authorization header, matching what
      // the GraphQL/API client sends: a raw personal API key, or `Bearer
      // <token>` for OAuth (access token or client credentials). This keeps
      // `Authorization: $(x-linear auth token)` correct for every auth mode.
      // resolveAuthorization() also enforces precedence and rejects a
      // half-configured bot / missing credentials.
      console.log(await resolveAuthorization())
    } catch (error) {
      handleError(error, "Failed to get token")
    }
  })
