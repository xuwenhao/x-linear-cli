import { Command } from "@cliffy/command"
import { gql } from "../../__codegen__/gql.ts"
import { handleError } from "../../utils/errors.ts"
import {
  describeAuthMode,
  getAuthMode,
  getGraphQLClient,
} from "../../utils/graphql.ts"
import { getResolvedScopes } from "../../utils/oauth.ts"
import { LINEAR_WEB_BASE_URL } from "../../const.ts"

const viewerQuery = gql(`
  query AuthStatus {
    viewer {
      id
      name
      displayName
      email
      admin
      guest
      organization {
        name
        urlKey
        logoUrl
      }
    }
  }
`)

export const whoamiCommand = new Command()
  .name("whoami")
  .description("Print information about the authenticated user")
  .action(async () => {
    try {
      const mode = getAuthMode()
      if (mode) {
        console.log(`Auth mode: ${describeAuthMode(mode)}`)
        if (mode === "client-credentials") {
          console.log(`  Scopes: ${getResolvedScopes()}`)
        }
      }

      const client = getGraphQLClient()
      const result = await client.request(viewerQuery)
      const viewer = result.viewer

      // An OAuth app token can authenticate successfully yet have no associated
      // user. Only that specific case (a successful request with a null viewer)
      // is benign; any thrown error — including a 401 from a revoked cached
      // token — falls through to handleError below rather than being masked.
      if (!viewer) {
        console.log(
          "  Authenticated, but this token has no viewer user (OAuth app).",
        )
        return
      }

      const org = viewer.organization

      console.log(`Workspace: ${org.name}`)
      console.log(`  Slug: ${org.urlKey}`)
      console.log(`  URL: ${LINEAR_WEB_BASE_URL}/${org.urlKey}`)

      console.log(`User: ${viewer.name}`)
      if (viewer.displayName !== viewer.name) {
        console.log(`  Display name: ${viewer.displayName}`)
      }
      console.log(`  Email: ${viewer.email}`)
      if (viewer.admin) {
        console.log(`  Role: admin`)
      } else if (viewer.guest) {
        console.log(`  Role: guest`)
      }
    } catch (error) {
      handleError(error, "Failed to get user info")
    }
  })
