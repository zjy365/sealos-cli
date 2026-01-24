import { Command } from 'commander'
import { createLoginCommand } from './login.ts'
import { createLogoutCommand } from './logout.ts'
import { createWhoamiCommand } from './whoami.ts'

/**
 * Register all authentication related commands
 */
export function registerAuthCommands (program: Command): void {
  program.addCommand(createLoginCommand())
  program.addCommand(createLogoutCommand())
  program.addCommand(createWhoamiCommand())
}
