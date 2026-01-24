import chalk from 'chalk'
import { table } from 'table'
import ora, { type Ora } from 'ora'

/**
 * Output JSON format
 */
export function outputJson (data: any): void {
  console.log(JSON.stringify(data, null, 2))
}

/**
 * Output YAML format
 */
export function outputYaml (data: any): void {
  // TODO: Use yaml library to implement
  console.log('YAML output not implemented yet')
  console.log(data)
}

/**
 * Output table
 */
export function outputTable (data: string[][]): void {
  console.log(table(data))
}

/**
 * Format output
 */
export function formatOutput (data: any, format: 'json' | 'yaml' | 'table' = 'table'): void {
  switch (format) {
    case 'json':
      outputJson(data)
      break
    case 'yaml':
      outputYaml(data)
      break
    case 'table':
      if (Array.isArray(data)) {
        outputTable(data)
      } else {
        console.log(data)
      }
      break
    default:
      console.log(data)
  }
}

/**
 * Success message
 */
export function success (message: string): void {
  console.log(chalk.green('✓'), message)
}

/**
 * Error message
 */
export function error (message: string): void {
  console.error(chalk.red('✗'), message)
}

/**
 * Warning message
 */
export function warn (message: string): void {
  console.warn(chalk.yellow('⚠'), message)
}

/**
 * Info message
 */
export function info (message: string): void {
  console.log(chalk.blue('ℹ'), message)
}

/**
 * Create loading spinner
 */
export function spinner (text: string): Ora {
  return ora(text).start()
}

/**
 * Confirmation prompt
 */
export async function confirm (message: string): Promise<boolean> {
  // TODO: Use inquirer or other interactive library
  console.log(chalk.yellow('?'), message)
  return true
}
