# Architecture

## Overview

This CLI follows Node.js best practices with a modular, maintainable structure.

## Module Organization

### 1. Commands (`src/commands/`)

Each command module is self-contained with its own directory:

```text
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

```text
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
6. Add shell completion scripts

---

## New: Type-Safe OpenAPI Client + OAuth2 Login

> This section describes the newly introduced architecture, independent from the above. The template command has been migrated to this approach. All new commands should use it.

### Flow

```text
OpenAPI Spec (src/docs/*.json)
       │
       │  npx openapi-typescript (generated at build time)
       ▼
Generated Types (src/generated/*.ts)
       │
       │  import type { paths }
       ▼
Typed Client Factory (src/lib/api-client.ts)
       │
       │  createTemplateClient()
       ▼
Command handler wrapped with withAuth / withErrorHandling
       │
       ▼
src/commands/template/index.ts (all subcommands)
```

### Build

```json
{
  "generate:api": "openapi-typescript src/docs/template_openapi.json -o src/generated/template.ts",
  "build": "npm run generate:api && tsc && tsup"
}
```

### Authentication: OAuth2 Device Grant Flow (RFC 8628)

`sealos login <host>` without `-t` triggers the device authorization flow. With `-t` the kubeconfig is saved directly.

```text
sealos login <host>
       │
       ▼
oauth.ts: requestDeviceAuthorization(region)
  POST /api/auth/oauth2/device → { device_code, user_code, verification_uri }
       │
       ▼
User opens browser to authorize
       │
       ▼
oauth.ts: pollForToken(region, deviceCode, interval, expiresIn)
  POST /api/auth/oauth2/token → poll until { access_token }
  Handles: authorization_pending, slow_down (+5s), access_denied, expired_token
  Hard cap: 10 minutes
       │
       ▼
oauth.ts: exchangeForKubeconfig(region, accessToken)
  POST /api/auth/getDefaultKubeconfig → { data: { kubeconfig } }
       │
       ▼
config.ts: upsertContext({ name, host, token: kubeconfig, workspace })
  → ~/.sealos/config.json
```

### API Authentication Chain

After login, the kubeconfig is stored as `context.token`. API calls obtain it via `auth.ts`:

```text
auth.ts: getToken() → getCurrentContext().token
       │
       ▼
auth.ts: getAuthHeaders() → { Authorization: encodeURIComponent(token) }
       │
       ▼
API request headers
```

`api-client.ts` validates that a host is configured when creating a client. Throws `ConfigError` if not.

### Command Handler HOF

```ts
// Authenticated commands (deploy-raw, create-instance)
.action(withAuth({ spinnerText: 'Creating...' }, async (ctx, template, options) => {
  const client = createTemplateClient()
  const { data, error, response } = await client.POST('/templates/instances', {
    headers: ctx.auth,
    body: { ... }
  })
  if (error) throw mapApiError(response.status, error)
}))

// Public commands (list, get — no auth required)
.action(withErrorHandling({ spinnerText: 'Loading...' }, async (ctx, options) => {
  const client = createTemplateClient()
  const { data, error, response } = await client.GET('/templates', { ... })
  if (error) throw mapApiError(response.status, error)
}))
```

### Error Handling

Unified API error format: `{ error: { type, code, message, details? } }`

`mapApiError(status, body)` maps to `AuthError` (401) or `ApiError` (other).

### Files

| File | Role |
|------|------|
| `src/lib/constants.ts` | OAuth2 `CLIENT_ID` |
| `src/lib/oauth.ts` | Device grant flow: request → poll → exchange → browser open |
| `src/commands/auth/login.ts` | Login command: `-t` direct token or device grant |
| `src/docs/template_openapi.json` | OpenAPI 3.1.0 spec |
| `src/generated/template.ts` | Auto-generated types (do not edit manually) |
| `src/lib/auth.ts` | getToken / getAuthHeaders / requireAuth |
| `src/lib/with-auth.ts` | withAuth / withErrorHandling HOF |
| `src/lib/api-client.ts` | Client factory + host validation |
| `src/commands/template/index.ts` | Template commands |

### Adding a New API

1. Place spec at `src/docs/<name>_openapi.json`
2. Extend the `generate:api` script
3. Add `create<Name>Client()` in `api-client.ts`
4. Use typed client + withAuth in the command
