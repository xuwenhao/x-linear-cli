import { Command } from "@cliffy/command"
import { gql } from "../../__codegen__/gql.ts"
import { handleError } from "../../utils/errors.ts"
import {
  describeAuthMode,
  getAuthMode,
  getGraphQLClient,
} from "../../utils/graphql.ts"
import {
  getClientCredentialsToken,
  getResolvedScopes,
} from "../../utils/oauth.ts"
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
    const mode = getAuthMode()
    try {
      // Only suppress a failed `viewer` query once we've independently
      // confirmed the credentials work (client-credentials token exchange).
      let credentialsVerified = false
      if (mode) {
        console.log(`Auth mode: ${describeAuthMode(mode)}`)
        if (mode === "client-credentials") {
          console.log(`  Scopes: ${getResolvedScopes()}`)
          // Verify the credentials up front so a bad client_id/secret is
          // reported clearly instead of being masked as "no viewer" below.
          await getClientCredentialsToken()
          credentialsVerified = true
        }
      }

      const client = getGraphQLClient()
      let viewer
      try {
        const result = await client.request(viewerQuery)
        viewer = result.viewer
      } catch (viewerError) {
        // An OAuth app may have no associated user, but only treat that as
        // benign once auth is confirmed; otherwise surface the real error.
        if (credentialsVerified) {
          console.log(
            "  Credentials verified, but no viewer user is available for this OAuth app.",
          )
          return
        }
        throw viewerError
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
