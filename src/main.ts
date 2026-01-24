#!/usr/bin/env node
import { Command } from 'commander'
import { registerAuthCommands } from './commands/auth/index.ts'
import { createWorkspaceCommand } from './commands/workspace/index.ts'
import { createDevboxCommand } from './commands/devbox/index.ts'
import { createS3Command } from './commands/s3/index.ts'
import { createDatabaseCommand } from './commands/database/index.ts'
import { createTemplateCommand } from './commands/template/index.ts'
import { createQuotaCommand } from './commands/quota/index.ts'
import { createAppCommand } from './commands/app/index.ts'
import { createConfigCommand } from './commands/config/index.ts'
import { handleError } from './lib/errors.ts'

export function createProgram (): Command {
  const program = new Command()

  program
    .name('sealos')
    .description('Official CLI tool for Sealos Cloud - Manage devbox, applications, databases, and object storage')
    .version('0.0.1')

  // Register all command modules
  registerAuthCommands(program)
  program.addCommand(createWorkspaceCommand())
  program.addCommand(createDevboxCommand())
  program.addCommand(createS3Command())
  program.addCommand(createDatabaseCommand())
  program.addCommand(createTemplateCommand())
  program.addCommand(createQuotaCommand())
  program.addCommand(createAppCommand())
  program.addCommand(createConfigCommand())

  return program
}

export function runCLI (): void {
  const program = createProgram()

  // Global error handling
  program.exitOverride()

  try {
    program.parse(process.argv)
  } catch (error) {
    handleError(error)
  }
}
