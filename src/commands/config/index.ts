import { Command } from 'commander'
import { readConfig, setConfigValue, getConfigValue } from '../../lib/config.ts'
import { success, outputJson } from '../../lib/output.ts'
import { handleError } from '../../lib/errors.ts'

export function createConfigCommand (): Command {
  const configCmd = new Command('config')
    .description('Manage CLI configuration')

  configCmd
    .command('set')
    .description('Set a config value')
    .argument('<key>', 'Config key')
    .argument('<value>', 'Config value')
    .action(async (key, value) => {
      try {
        setConfigValue(key, value)
        success(`Config ${key} set to ${value}`)
      } catch (error) {
        handleError(error)
      }
    })

  configCmd
    .command('get')
    .description('Get a config value')
    .argument('<key>', 'Config key')
    .action(async (key) => {
      try {
        const value = getConfigValue(key)
        if (value) {
          console.log(value)
        } else {
          console.log(`Config key "${key}" not found`)
        }
      } catch (error) {
        handleError(error)
      }
    })

  configCmd
    .command('list')
    .description('List all config values')
    .action(async () => {
      try {
        const config = readConfig()
        outputJson(config)
      } catch (error) {
        handleError(error)
      }
    })

  return configCmd
}
