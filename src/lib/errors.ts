import chalk from 'chalk'

/**
 * CLI error base class
 */
export class CliError extends Error {
  constructor (message: string, public exitCode: number = 1) {
    super(message)
    this.name = 'CliError'
  }
}

/**
 * Authentication error
 */
export class AuthError extends CliError {
  constructor (message: string = 'Authentication required. Please run "sealos-cli login" first.') {
    super(message, 1)
    this.name = 'AuthError'
  }
}

/**
 * Configuration error
 */
export class ConfigError extends CliError {
  constructor (message: string) {
    super(message, 1)
    this.name = 'ConfigError'
  }
}

/**
 * Standard API error response body
 */
export interface ApiErrorBody {
  error?: {
    type?: string
    code?: string
    message?: string
    details?: Array<{ field: string; message: string }> | string
  }
}

/**
 * API error
 */
export class ApiError extends CliError {
  constructor (
    message: string,
    public statusCode?: number,
    public code?: string,
    public details?: Array<{ field: string; message: string }> | string
  ) {
    super(message, 1)
    this.name = 'ApiError'
  }
}

/**
 * Map an API error response to the appropriate CliError.
 * Supports the unified error format: { error: { type, code, message, details? } }
 */
export function mapApiError (status: number, body?: ApiErrorBody): CliError {
  const message = body?.error?.message || `API request failed with status ${status}`
  if (status === 401) {
    return new AuthError(message)
  }
  return new ApiError(message, status, body?.error?.code, body?.error?.details)
}

/**
 * Unified error handling
 */
export function handleError (error: unknown): never {
  if (error instanceof ApiError) {
    console.error(chalk.red('Error:'), error.message)
    if (error.details) {
      if (Array.isArray(error.details)) {
        for (const d of error.details) {
          console.error(chalk.yellow(`  ${d.field}:`), d.message)
        }
      } else {
        console.error(chalk.yellow('  Details:'), error.details)
      }
    }
    process.exit(error.exitCode)
  }

  if (error instanceof CliError) {
    console.error(chalk.red('Error:'), error.message)
    process.exit(error.exitCode)
  }

  if (error instanceof Error) {
    console.error(chalk.red('Error:'), error.message)
    if (process.env.DEBUG) {
      console.error(error.stack)
    }
    process.exit(1)
  }

  console.error(chalk.red('Error:'), 'An unknown error occurred')
  process.exit(1)
}
