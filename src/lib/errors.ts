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
  constructor (message: string = 'Authentication required. Please run "sealos login" first.') {
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
 * API error
 */
export class ApiError extends CliError {
  constructor (message: string, public statusCode?: number) {
    super(message, 1)
    this.name = 'ApiError'
  }
}

/**
 * Unified error handling
 */
export function handleError (error: unknown): never {
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
