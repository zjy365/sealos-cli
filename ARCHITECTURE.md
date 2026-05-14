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

#### `auth.ts` - Authentication

- Reads/writes `~/.sealos/auth.json`
- Stores the active workspace kubeconfig at `~/.sealos/kubeconfig`
- Builds provider API auth headers as URL-encoded kubeconfig content

#### `api-client.ts` - OpenAPI Clients

- Creates type-safe clients from generated OpenAPI types
- Resolves template provider hosts with the `template.` prefix
- Resolves database provider hosts with the `dbprovider.` prefix

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
Auth       API Client   Output       Error
(lib/auth) (lib/api-client) (lib/output) (lib/errors)
    ↓           ↓            ↓            ↓
Auth files     HTTP Req     Terminal    Error Handler
in ~/.sealos   to Sealos     Display     & Exit
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

### 2. Centralized Authentication

All Sealos auth operations go through `lib/auth.ts`:

```typescript
const headers = requireAuth()
const info = getAuthInfo()
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

- `SEALOS_REGION` - Default Sealos region URL
- `SEALOS_DATABASE_HOST` - Override database provider host
- `DEBUG` - Shows full stack traces on errors

## Configuration File

Location: `~/.sealos/auth.json`

```json
{
  "region": "https://usw-1.sealos.io",
  "access_token": "...",
  "regional_token": "...",
  "authenticated_at": "2026-05-14T00:00:00.000Z",
  "auth_method": "oauth2_device_grant",
  "current_workspace": {
    "uid": "...",
    "id": "default",
    "teamName": "Default"
  }
}
```

The active kubeconfig is stored separately at `~/.sealos/kubeconfig`.

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
  const client = createTemplateClient()
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

## Type-Safe OpenAPI Client + OAuth2 Login

Template and database commands use this path.

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
       │  createTemplateClient() / createDatabaseClient()
       ▼
Command handler wrapped with withAuth / withErrorHandling
       │
       ▼
src/commands/template/index.ts / src/commands/database/index.ts
```

### Build

```json
{
  "generate:api": "openapi-typescript src/docs/template_openapi.json -o src/generated/template.ts && openapi-typescript src/docs/database_openapi.json -o src/generated/database.ts",
  "build": "npm run generate:api && tsc && tsup"
}
```

### Authentication: OAuth2 Device Grant Flow (RFC 8628)

`sealos login [region]` triggers the device authorization flow.

```text
sealos login [region]
       │
       ▼
auth.ts: requestDeviceAuthorization(region)
  POST /api/auth/oauth2/device → { device_code, user_code, verification_uri }
       │
       ▼
User opens browser to authorize
       │
       ▼
auth.ts: pollForToken(region, deviceCode, interval, expiresIn)
  POST /api/auth/oauth2/token → poll until { access_token }
  Handles: authorization_pending, slow_down (+5s), access_denied, expired_token
  Hard cap: 10 minutes
       │
       ▼
auth.ts: getRegionToken(region, accessToken)
  POST /api/auth/regionToken → { data: { token, kubeconfig } }
       │
       ▼
auth.ts: saveAuth(...) + saveKubeconfig(...)
  → ~/.sealos/auth.json + ~/.sealos/kubeconfig
```

### API Authentication Chain

Provider APIs documented in `src/docs/*_openapi.json` expect URL-encoded kubeconfig content in the `Authorization` header:

```text
auth.ts: getKubeconfigContent() → ~/.sealos/kubeconfig
       │
       ▼
auth.ts: getAuthHeaders() → { Authorization: encodeURIComponent(kubeconfig) }
       │
       ▼
API request headers
```

Auth-management calls such as workspace list/switch use the regional token internally.

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
| `src/commands/auth/login.ts` | Device grant login command |
| `src/docs/template_openapi.json` | Template OpenAPI 3.1.0 spec |
| `src/docs/database_openapi.json` | Database OpenAPI 3.1.0 spec |
| `src/generated/template.ts` | Auto-generated template types |
| `src/generated/database.ts` | Auto-generated database types |
| `src/lib/auth.ts` | Device grant flow, auth state, kubeconfig auth headers |
| `src/lib/with-auth.ts` | withAuth / withErrorHandling HOF |
| `src/lib/api-client.ts` | Client factory + host validation |
| `src/commands/template/index.ts` | Template commands |
| `src/commands/database/index.ts` | Database commands |

### Adding a New API

1. Place spec at `src/docs/<name>_openapi.json`
2. Extend the `generate:api` script
3. Add `create<Name>Client()` in `api-client.ts`
4. Use typed client + withAuth in the command
