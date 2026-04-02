import { Command } from 'commander'
import { upsertContext } from '../../lib/config.ts'
import { deviceGrantLogin } from '../../lib/oauth.ts'
import { success, error as logError, spinner } from '../../lib/output.ts'
import { handleError } from '../../lib/errors.ts'

function isKubeconfigObject (value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const candidate = value as Record<string, unknown>
  return typeof candidate.apiVersion === 'string' &&
    Array.isArray(candidate.clusters) &&
    Array.isArray(candidate.contexts) &&
    Array.isArray(candidate.users)
}

function isKubeconfigYaml (value: string): boolean {
  return /^\s*apiVersion\s*:/m.test(value) &&
    /^\s*clusters\s*:/m.test(value) &&
    /^\s*contexts\s*:/m.test(value) &&
    /^\s*users\s*:/m.test(value)
}

export function validateDirectKubeconfigInput (value: string): string {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    throw new Error('--token now expects kubeconfig content, not an access token. Use browser login or pass kubeconfig.')
  }

  if (isKubeconfigYaml(trimmed)) {
    return trimmed
  }

  try {
    if (isKubeconfigObject(JSON.parse(trimmed) as unknown)) {
      return trimmed
    }
  } catch {
    // Fall through to the shared error below.
  }

  throw new Error('--token now expects kubeconfig content, not an access token. Use browser login or pass kubeconfig.')
}

export function createLoginCommand (): Command {
  return new Command('login')
    .description('Login to Sealos Cloud')
    .argument('<host>', 'Sealos host (e.g., usw.sealos.io or https://usw.sealos.io)')
    .option('-t, --token <token>', 'Login with kubeconfig content (deprecated flag name)')
    .addHelpText('after', `
Examples:
  sealos login hzh.sealos.run
  sealos login hzh.sealos.run --token "$(cat ~/.kube/config)"
`)
    .action(async (host: string, options) => {
      // Login flow:
      // 1. With --token: save kubeconfig directly as context
      // 2. Without --token: OAuth2 Device Grant (RFC 8628)
      //    a. Request device code from /api/auth/oauth2/device
      //    b. User opens browser to authorize
      //    c. Poll /api/auth/oauth2/token until approved
      //    d. Exchange access_token for kubeconfig
      //    e. Save kubeconfig as context token
      try {
        const region = normalizeHost(host)

        // Direct kubeconfig login
        if (options.token) {
          const kubeconfig = validateDirectKubeconfigInput(options.token)
          const spin = spinner('Logging in...')
          upsertContext({
            name: host,
            host: region,
            token: kubeconfig,
            workspace: 'default'
          })
          spin.succeed(`Logged in to ${host}`)
          success('Kubeconfig saved successfully')
          return
        }

        // OAuth2 Device Grant flow
        const spin = spinner('Logging in...')
        const result = await deviceGrantLogin(region, spin)

        // Save kubeconfig as context token
        upsertContext({
          name: host,
          host: result.region,
          token: result.kubeconfig,
          workspace: 'default'
        })

        spin.succeed(`Logged in to ${host}`)
        success('Authentication successful')
      } catch (err) {
        logError('Login failed')
        handleError(err)
      }
    })
}

/**
 * Normalize a host argument to an https:// URL.
 * Accepts bare hostnames (usw.sealos.io) or full URLs (https://usw.sealos.io).
 */
function normalizeHost (host: string): string {
  const trimmed = host.replace(/\/+$/, '')
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed
  }
  return `https://${trimmed}`
}
