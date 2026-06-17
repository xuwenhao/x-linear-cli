import { Command } from "@cliffy/command"
import { gql } from "../../__codegen__/gql.ts"
import { isUsingInlineFormat } from "../../credentials.ts"
import * as keyring from "../../keyring/index.ts"
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

export const statusCommand = new Command()
  .name("status")
  .description("Print information about the authenticated user")
  .action(async () => {
    const mode = getAuthMode()
    try {
      // Tracks whether we've independently confirmed the credentials work
      // (i.e. a successful client-credentials token exchange). Only then is it
      // safe to treat a failed `viewer` query as the benign no-viewer case.
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
        // An OAuth app may have no associated user, so `viewer` can fail even
        // when auth is fine — but only suppress that error once we've confirmed
        // the credentials are valid. Otherwise (e.g. an expired
        // LINEAR_ACCESS_TOKEN) surface the real authentication/network error.
        if (credentialsVerified) {
          console.log(
            "  Credentials verified, but no viewer user is available for " +
              "this OAuth app. Use team/issue commands to verify access.",
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

      const inline = isUsingInlineFormat()
      const keyringOk = await keyring.isAvailable()
      console.log(
        `Credential storage: ${inline ? "plaintext file" : "system keyring"}`,
      )
      if (inline && keyringOk) {
        console.log(
          `  System keyring is available. Run \`x-linear auth migrate\` to migrate.`,
        )
      } else if (inline && !keyringOk) {
        console.log(`  System keyring is not available on this system.`)
      }
    } catch (error) {
      handleError(error, "Failed to get auth status")
    }
  })
