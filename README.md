# Sealos CLI

Official CLI tool for Sealos Cloud - Manage devbox, applications, databases, and object storage

## Project Structure

```
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
│   ├── s3/                   # S3 object storage
│   │   └── index.ts
│   ├── database/             # Database management
│   │   └── index.ts
│   ├── template/             # Template management
│   │   └── index.ts
│   ├── quota/                # Resource quotas
│   │   └── index.ts
│   ├── app/                  # Application management
│   │   └── index.ts
│   └── config/               # CLI configuration
│       └── index.ts
├── lib/                       # Shared libraries
│   ├── api.ts                # API client
│   ├── config.ts             # Configuration management
│   ├── errors.ts             # Error handling
│   └── output.ts             # Output formatting
├── types/                     # TypeScript type definitions
│   └── index.ts
└── main.ts                    # Main program setup
```

## Architecture

### Configuration Management (`lib/config.ts`)
- Manages CLI configuration at `~/.sealos/config.json`
- Handles multiple contexts (hosts/workspaces)
- Supports environment variables (e.g., `KUBECONFIG`)

### API Client (`lib/api.ts`)
- Axios-based HTTP client with interceptors
- Automatic token injection from current context
- Unified error handling
- Support for KUBECONFIG environment variable

### Output Formatting (`lib/output.ts`)
- Support for multiple formats: JSON, YAML, Table
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
# Login in browser and exchange for kubeconfig automatically
sealos login hzh.sealos.run

# Login with kubeconfig content
sealos login hzh.sealos.run --token "$(cat ~/.kube/config)"

# Check current user
sealos whoami

# Logout
sealos logout
```

### Template Management
```bash
# Deploy from the catalog
sealos template deploy perplexica --name my-app --set OPENAI_API_KEY=xxx

# Validate raw template YAML without creating resources
sealos template deploy --file ./template.yaml --dry-run
```

### Workspace Management
```bash
# List workspaces
sealos workspace list

# Switch workspace
sealos workspace switch production

# Show current workspace
sealos workspace current
```

### Devbox Management
```bash
# Create a devbox
sealos devbox create --name my-devbox --template nextjs --cpu 2c --memory 4g

# List devboxes
sealos devbox list
sealos devbox list --output json

# Get devbox details
sealos devbox get my-devbox

# Connect to devbox
sealos devbox connect my-devbox --ide cursor

# Start/Stop/Restart
sealos devbox start my-devbox
sealos devbox stop my-devbox
sealos devbox restart my-devbox

# Delete devbox
sealos devbox delete my-devbox --force
```

### Database Management
```bash
# List databases
sealos database list

# Get database details
sealos database get my-db

# Create a database
sealos database create postgresql --name my-db --cpu 1 --memory 2 --storage 5 --replicas 1

# Show connection details
sealos database connection my-db

# More commands
sealos database --help
sealos database <subcommand> --help
```

Implementation: `src/commands/database/index.ts`

### Configuration
```bash
# List all config
sealos config list

# Get config value
sealos config get currentContext

# Set config value
sealos config set key value
```

## Environment Variables

- `KUBECONFIG`: Path to Kubernetes config file (automatically included in API requests)
- `DEBUG`: Enable debug mode for verbose error output

## TODO

Most command implementations contain TODO comments indicating where API integration is needed. Key areas:

1. **Authentication**: OAuth flow for browser-based login
2. **API Integration**: Connect all commands to actual Sealos API endpoints
3. **S3 Operations**: File upload/download with progress tracking
4. **Devbox Management**: Connect devbox commands to actual Sealos API endpoints
5. **Interactive Prompts**: Use inquirer for confirmations
6. **YAML Support**: Add YAML output formatting
7. **Config Nesting**: Support nested config key access

## Best Practices Implemented

- Modular command structure
- TypeScript for type safety
- Shared utilities for common operations
- Consistent error handling
- Multiple output formats
- Environment variable support
- Configuration file management
- Loading indicators for async operations
- Color-coded terminal output

## License

Apache-2.0
