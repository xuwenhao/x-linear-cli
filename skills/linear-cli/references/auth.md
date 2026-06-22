# auth

> Manage Linear authentication

## Usage

```
Usage:   x-linear auth

Description:

  Manage Linear authentication

Options:

  -h, --help           - Show this help.                      
  --workspace  <slug>  - Target workspace (uses credentials)  

Commands:

  login                 - Add a workspace credential                                               
  logout   [workspace]  - Remove a workspace credential                                            
  list                  - List configured workspaces                                               
  default  [workspace]  - Set the default workspace                                                
  token                 - Print the Authorization header value (API key, or `Bearer <OAuth token>`)
  whoami                - Print information about the authenticated user                           
  migrate               - Migrate plaintext credentials to system keyring
```

## Subcommands

### login

> Add a workspace credential

```
Usage:   x-linear auth login

Description:

  Add a workspace credential

Options:

  -h, --help           - Show this help.                                              
  --workspace  <slug>  - Target workspace (uses credentials)                          
  -k, --key    <key>   - API key (prompted if not provided)                           
  --plaintext          - Store API key in credentials file instead of system keyring
```

### logout

> Remove a workspace credential

```
Usage:   x-linear auth logout [workspace]

Description:

  Remove a workspace credential

Options:

  -h, --help           - Show this help.                      
  --workspace  <slug>  - Target workspace (uses credentials)  
  -f, --force          - Skip confirmation prompt
```

### list

> List configured workspaces

```
Usage:   x-linear auth list

Description:

  List configured workspaces

Options:

  -h, --help           - Show this help.                      
  --workspace  <slug>  - Target workspace (uses credentials)
```

### default

> Set the default workspace

```
Usage:   x-linear auth default [workspace]

Description:

  Set the default workspace

Options:

  -h, --help           - Show this help.                      
  --workspace  <slug>  - Target workspace (uses credentials)
```

### token

> Print the Authorization header value (API key, or `Bearer <OAuth token>`)

```
Usage:   x-linear auth token

Description:

  Print the Authorization header value (API key, or `Bearer <OAuth token>`)

Options:

  -h, --help           - Show this help.                      
  --workspace  <slug>  - Target workspace (uses credentials)
```

### whoami

> Print information about the authenticated user

```
Usage:   x-linear auth whoami

Description:

  Print information about the authenticated user

Options:

  -h, --help           - Show this help.                      
  --workspace  <slug>  - Target workspace (uses credentials)
```

### migrate

> Migrate plaintext credentials to system keyring

```
Usage:   x-linear auth migrate

Description:

  Migrate plaintext credentials to system keyring

Options:

  -h, --help           - Show this help.                      
  --workspace  <slug>  - Target workspace (uses credentials)
```
