---
name: linear-cli
description: Manage Linear issues from the command line using the x-linear cli (a fork of linear-cli with OAuth/bot auth). This skill allows automating linear management.
allowed-tools: Bash(x-linear:*), Bash(curl:*)
---

# x-linear CLI

A CLI to manage Linear issues from the command line, with git and jj integration. This is a fork of [schpet/linear-cli](https://github.com/schpet/linear-cli) that adds OAuth client-credentials (bot) auth; the command is `x-linear`.

## Prerequisites

The `x-linear` command must be available on PATH. To check:

```bash
x-linear --version
```

If it is not installed, install from source:

```bash
git clone https://github.com/xuwenhao/x-linear-cli
cd x-linear-cli
deno task install   # installs the `x-linear` command
```

## Best Practices for Markdown Content

When working with issue descriptions or comment bodies that contain markdown, **always prefer using file-based flags** instead of passing content as command-line arguments:

- Use `--description-file` for `issue create` and `issue update` commands
- Use `--body-file` for `comment add` and `comment update` commands

**Why use file-based flags:**

- Ensures proper formatting in the Linear web UI
- Avoids shell escaping issues with newlines and special characters
- Prevents literal `\n` sequences from appearing in markdown
- Makes it easier to work with multi-line content

**Example workflow:**

```bash
# Write markdown to a temporary file
cat > /tmp/description.md <<'EOF'
## Summary

- First item
- Second item

## Details

This is a detailed description with proper formatting.
EOF

# Create issue using the file
x-linear issue create --title "My Issue" --description-file /tmp/description.md

# Or for comments
x-linear issue comment add ENG-123 --body-file /tmp/comment.md
```

**Only use inline flags** (`--description`, `--body`) for simple, single-line content.

## Available Commands

Compact command list, generated from `x-linear --help`:

```bash
{{COMMANDS}}
```

## Reference Documentation

{{REFERENCE_TOC}}

For curated examples of organization features (initiatives, labels, projects, bulk operations), see [organization-features](references/organization-features.md).

## Discovering Options

To see available subcommands and flags, run `--help` on any command:

```bash
x-linear --help
x-linear issue --help
x-linear issue list --help
x-linear issue create --help
```

Each command has detailed help output describing all available flags and options.

Some commands have required flags that aren't obvious. Notable examples:

- `issue list` requires a sort order — provide it via `--sort` (valid values: `manual`, `priority`), the `issue_sort` config option, or the `LINEAR_ISSUE_SORT` env var. Also requires `--team <key>` unless the team can be inferred from the directory — if unknown, run `x-linear team list` first.
- `--no-pager` is only supported on `issue list` — passing it to other commands like `project list` will error.

## Using the Linear GraphQL API Directly

**Prefer the CLI for all supported operations.** The `api` command should only be used as a fallback for queries not covered by the CLI.

### Check the schema for available types and fields

Write the schema to a tempfile, then search it:

```bash
x-linear schema -o "${TMPDIR:-/tmp}/linear-schema.graphql"
grep -i "cycle" "${TMPDIR:-/tmp}/linear-schema.graphql"
grep -A 30 "^type Issue " "${TMPDIR:-/tmp}/linear-schema.graphql"
```

### Make a GraphQL request

**Important:** GraphQL queries containing non-null type markers (e.g. `String` followed by an exclamation mark) must be passed via heredoc stdin to avoid escaping issues. Simple queries without those markers can be passed inline.

```bash
# Simple query (no type markers, so inline is fine)
x-linear api '{ viewer { id name email } }'

# Query with variables — use heredoc to avoid escaping issues
x-linear api --variable teamId=abc123 <<'GRAPHQL'
query($teamId: String!) { team(id: $teamId) { name } }
GRAPHQL

# Search issues by text
x-linear api --variable term=onboarding <<'GRAPHQL'
query($term: String!) { searchIssues(term: $term, first: 20) { nodes { identifier title state { name } } } }
GRAPHQL

# Numeric and boolean variables
x-linear api --variable first=5 <<'GRAPHQL'
query($first: Int!) { issues(first: $first) { nodes { title } } }
GRAPHQL

# Complex variables via JSON
x-linear api --variables-json '{"filter": {"state": {"name": {"eq": "In Progress"}}}}' <<'GRAPHQL'
query($filter: IssueFilter!) { issues(filter: $filter) { nodes { title } } }
GRAPHQL

# Pipe to jq for filtering
x-linear api '{ issues(first: 5) { nodes { identifier title } } }' | jq '.data.issues.nodes[].title'
```

### Advanced: Using curl directly

For cases where you need full HTTP control, use `x-linear auth token`:

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $(x-linear auth token)" \
  -d '{"query": "{ viewer { id } }"}'
```
