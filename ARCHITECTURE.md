# Architecture

## Overview

This CLI follows Node.js best practices with a modular, maintainable structure.

## Module Organization

### 1. Commands (`src/commands/`)
Each command module is self-contained with its own directory:

```
commands/
  auth/           - login, logout, whoami
  workspace/      - workspace management
  devbox/         - devbox operations
  s3/             - object storage
  database/       - database management
  template/       - template operations
  quota/          - resource quotas
  app/            - application management
  config/         - CLI configuration
```

Each module exports factory functions that create Commander.js command instances.

### 2. Shared Libraries (`src/lib/`)

#### `config.ts` - Configuration Management
- Reads/writes `~/.sealos/config.json`
- Manages contexts (host, token, workspace)
- Helper functions for context switching

#### `api.ts` - HTTP Client
- Axios-based client with interceptors
- Automatic authentication via Bearer token
- KUBECONFIG environment variable support
- Unified error handling (401 → AuthError)

#### `output.ts` - Output Formatting
- `outputJson()` - JSON output
- `outputYaml()` - YAML output (TODO)
- `outputTable()` - Table formatting
- `success()`, `error()`, `warn()`, `info()` - Colored messages
- `spinner()` - Loading indicators

#### `errors.ts` - Error Handling
- `CliError` - Base error class
- `AuthError` - Authentication errors
- `ConfigError` - Configuration errors
- `ApiError` - API call errors
- `handleError()` - Global error handler

### 3. Type Definitions (`src/types/`)
- TypeScript interfaces for configuration
- API request/response types
- Shared type definitions

### 4. Entry Points

#### `src/main.ts`
- Creates Commander.js program
- Registers all command modules
- Sets up global error handling

#### `src/bin/cli.ts`
- CLI entry point
- Calls `runCLI()` from main.ts

## Data Flow

```
User Command
    ↓
CLI Entry (bin/cli.ts)
    ↓
Main Program (main.ts)
    ↓
Command Module (commands/*/index.ts)
    ↓
┌─────────────┬──────────────┬────────────┐
│             │              │            │
Config      API Client   Output       Error
(lib/config) (lib/api)   (lib/output) (lib/errors)
    ↓           ↓            ↓            ↓
Configuration  HTTP Req     Terminal    Error Handler
File          to Sealos     Display     & Exit
```

## Key Design Patterns

### 1. Factory Pattern
Commands are created via factory functions:
```typescript
export function createDevboxCommand(): Command {
  const cmd = new Command('devbox')
  // configure command
  return cmd
}
```

### 2. Centralized Configuration
All config operations go through `lib/config.ts`:
```typescript
const context = getCurrentContext()
upsertContext(newContext)
```

### 3. Interceptor Pattern
API client uses axios interceptors for:
- Adding auth tokens to requests
- Converting 401 errors to AuthError

### 4. Error Wrapping
All command actions wrapped in try/catch:
```typescript
.action(async (name) => {
  try {
    // command logic
  } catch (error) {
    handleError(error)
  }
})
```

## Environment Variables

- `KUBECONFIG` - Automatically added to API requests via `X-Kubeconfig` header
- `DEBUG` - Shows full stack traces on errors

## Configuration File

Location: `~/.sealos/config.json`

```json
{
  "currentContext": "default",
  "contexts": [
    {
      "name": "default",
      "host": "https://hzh.sealos.run",
      "token": "xxx",
      "workspace": "default"
    }
  ]
}
```

## Adding New Commands

1. Create directory in `src/commands/`
2. Create `index.ts` with factory function
3. Implement command logic with error handling
4. Register in `src/main.ts`
5. Use shared utilities from `lib/`

Example:
```typescript
// src/commands/example/index.ts
import { Command } from 'commander'
import { handleError } from '../../lib/errors.ts'
import { createApiClient } from '../../lib/api.ts'

export function createExampleCommand(): Command {
  const cmd = new Command('example')
    .description('Example command')
    .action(async () => {
      try {
        const api = createApiClient()
        // implementation
      } catch (error) {
        handleError(error)
      }
    })

  return cmd
}
```

## Testing Strategy

- Unit tests for `lib/` utilities
- Integration tests for command execution
- Mock API responses for command tests
- E2E tests for full workflows

## Future Improvements

1. Add YAML library for proper YAML output
2. Implement interactive prompts (inquirer)
3. Add progress bars for file uploads
4. Support nested config key access
5. Add command aliases
6. Implement OAuth flow for login
7. Add shell completion scripts
