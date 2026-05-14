import { Command } from 'commander'
import { loginWithDeviceFlow, loginWithToken } from '../../lib/auth.ts'
import { info, outputJson, success, warn } from '../../lib/output.ts'
import { handleError } from '../../lib/errors.ts'

export function createLoginCommand (): Command {
  return new Command('login')
    .description('Login to Sealos Cloud')
    .argument('[region]', 'Sealos region URL (e.g., https://usw-1.sealos.io)')
    .option('-t, --token <token>', 'Store a regional token without OAuth device login')
    .option('-o, --output <format>', 'Output format: json, table', 'table')
    .action(async (region, options) => {
      try {
        const result = options.token
          ? await loginWithToken(region, options.token)
          : await loginWithDeviceFlow(region)

        if (options.token) {
          warn('Token login is limited: kubeconfig is not generated. Use device login for full auth.')
        }

        if (options.output === 'json') {
          outputJson(result)
        } else {
          success(`Logged in to ${result.region}`)
          info(`Workspace: ${result.workspace}`)
          if (result.kubeconfig_path) {
            info(`Kubeconfig: ${result.kubeconfig_path}`)
          }
        }
      } catch (error) {
        handleError(error)
      }
    })
}
