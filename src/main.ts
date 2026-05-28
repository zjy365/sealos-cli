#!/usr/bin/env node
import { Command } from 'commander'
import { registerAuthCommands } from './commands/auth/index.ts'
import { createWorkspaceCommand } from './commands/workspace/index.ts'
import { createDevboxCommand } from './commands/devbox/index.ts'
import { createDatabaseCommand } from './commands/database/index.ts'
import { createTemplateCommand } from './commands/template/index.ts'
import { createS3Command } from './commands/s3/index.ts'
import { handleError } from './lib/errors.ts'
import packageJson from '../package.json' with { type: 'json' }

export function createProgram (): Command {
  const program = new Command()

  program
    .name('sealos-cli')
    .description('Official CLI tool for Sealos Cloud - Manage devbox, databases, templates, auth, and workspaces')
    .version(packageJson.version)

  // Register all command modules
  registerAuthCommands(program)
  program.addCommand(createWorkspaceCommand())
  program.addCommand(createDevboxCommand())
  program.addCommand(createDatabaseCommand())
  program.addCommand(createTemplateCommand())
  program.addCommand(createS3Command())

  return program
}

export function runCLI (): void {
  const program = createProgram()

  // Global error handling
  program.exitOverride()

  try {
    program.parse(process.argv)
  } catch (error) {
    if (error instanceof Error && 'code' in error &&
      typeof error.code === 'string' && error.code.startsWith('commander.')) {
      process.exit(0)
    }
    handleError(error)
  }
}
