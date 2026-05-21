# Sealos CLI

Official CLI tool for Sealos Cloud - Manage auth, workspaces, devboxes, databases, and templates.

## Project Structure

```text
src/
├── bin/
│   └── cli.ts                 # CLI entry point
├── commands/                  # Command modules
│   ├── auth/                 # Authentication commands
│   │   ├── login.ts
│   │   ├── logout.ts
│   │   ├── whoami.ts
│   │   └── index.ts
│   ├── workspace/            # Workspace management
│   │   └── index.ts
│   ├── devbox/               # Devbox management
│   │   └── index.ts
│   ├── database/             # Database management
│   │   └── index.ts
│   ├── template/             # Template management
│   │   └── index.ts
├── lib/                       # Shared libraries
│   ├── api-client.ts         # OpenAPI client factories
│   ├── auth.ts               # Sealos auth and kubeconfig headers
│   ├── errors.ts             # Error handling
│   └── output.ts             # Output formatting
├── types/                     # TypeScript type definitions
│   └── index.ts
└── main.ts                    # Main program setup
```

## Architecture

### Authentication (`lib/auth.ts`)

- Manages Sealos auth state at `~/.sealos/auth.json`
- Stores current workspace kubeconfig at `~/.sealos/kubeconfig`
- Builds provider API headers with URL-encoded kubeconfig content

### OpenAPI Clients (`lib/api-client.ts`)

- Type-safe clients generated from `src/docs/*_openapi.json`
- Routes template calls to `template.<region>/api/v2alpha`
- Routes database calls to `dbprovider.<region>/api/v2alpha`
- Routes devbox calls to `devbox.<region>/api/v2alpha`

### Output Formatting (`lib/output.ts`)

- JSON and table output helpers for command responses
- Colored terminal output using chalk
- Loading spinners using ora
- Table formatting using table

### Error Handling (`lib/errors.ts`)

- Typed error classes (AuthError, ConfigError, ApiError)
- Global error handler
- User-friendly error messages

## Development

### Install Dependencies

```bash
npm install
```

### Run CLI in Development

```bash
npm start -- <command>

# Examples:
npm start -- --help
npm start -- login
npm start -- devbox list
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## Usage Examples

### Authentication

```bash
# Login in browser and exchange for regional token + kubeconfig automatically
sealos-cli login https://usw-1.sealos.io

# Check current user
sealos-cli whoami

# Inspect auth and switch workspace
sealos-cli auth info
sealos-cli auth list
sealos-cli auth switch <workspace-id-or-team-name>

# Logout
sealos-cli logout
```

### Template Management

```bash
# Deploy from the catalog
sealos-cli template deploy perplexica --name my-app --set OPENAI_API_KEY=xxx

# Validate raw template YAML without creating resources
sealos-cli template deploy --file ./template.yaml --dry-run
```

### Workspace Management

```bash
# List workspaces
sealos-cli workspace list

# Switch workspace
sealos-cli workspace switch production

# Show current workspace
sealos-cli workspace current
```

### Devbox Management

```bash
# Create a devbox
sealos-cli devbox create --name my-devbox --runtime next.js --cpu 2c --memory 4g --port 3000:http:public

# List devboxes
sealos-cli devbox list
sealos-cli devbox list --output json

# Get devbox details
sealos-cli devbox get my-devbox

# Update resources or ports
sealos-cli devbox update my-devbox --cpu 4 --memory 8 --port portName=web,number=3000,protocol=http,isPublic=true

# Start/Pause/Shutdown/Restart
sealos-cli devbox start my-devbox
sealos-cli devbox pause my-devbox
sealos-cli devbox shutdown my-devbox
sealos-cli devbox restart my-devbox

# Configure autostart and inspect monitor data
sealos-cli devbox autostart my-devbox --exec-command "npm start"
sealos-cli devbox monitor my-devbox --step 2m

# Templates, releases, and deployments
sealos-cli devbox templates
sealos-cli devbox releases list my-devbox
sealos-cli devbox releases create my-devbox --tag v1-0-0 --description "First release"
sealos-cli devbox releases deploy my-devbox v1-0-0
sealos-cli devbox deployments my-devbox

# Delete devbox
sealos-cli devbox delete my-devbox
```

Implementation: `src/commands/devbox/index.ts`, backed by `src/docs/devbox_openapi.json`.

### Database Management

```bash
# List databases
sealos-cli database list

# Get database details
sealos-cli database get my-db

# Create a database
sealos-cli database create postgresql --name my-db --cpu 1 --memory 2 --storage 5 --replicas 1

# Show connection details
sealos-cli database connection my-db

# More commands
sealos-cli database --help
sealos-cli database <subcommand> --help

# Operational commands backed by src/docs/database_openapi.json
sealos-cli database update my-db --cpu 2 --memory 4
sealos-cli database start my-db
sealos-cli database pause my-db
sealos-cli database restart my-db
sealos-cli database backup my-db --name manual-backup
sealos-cli database backups my-db
sealos-cli database restore my-db --from manual-backup --name restored-db
sealos-cli database enable-public my-db
sealos-cli database disable-public my-db
sealos-cli database log-files <pod-name> --db-type postgresql --log-type runtimeLog
sealos-cli database logs <pod-name> --db-type postgresql --log-type runtimeLog --log-path /path/to/log
```

Implementation: `src/commands/database/index.ts`

## Environment Variables

- `SEALOS_REGION`: Default Sealos region URL for auth and public provider endpoints
- `SEALOS_DATABASE_HOST`: Override database provider host for database commands
- `SEALOS_DEVBOX_HOST`: Override devbox provider host for devbox commands
- `DEBUG`: Enable debug mode for verbose error output

## v1 Scope

The v1 command surface is limited to auth, workspace, template, database, and devbox operations. Future modules such as S3/object storage, quota inspection, and application management are intentionally not registered or documented as available commands.

## Best Practices Implemented

- Modular command structure
- TypeScript for type safety
- Shared utilities for common operations
- Consistent error handling
- JSON and table output formats
- Environment variable support
- Loading indicators for async operations
- Color-coded terminal output

## License

Apache-2.0
