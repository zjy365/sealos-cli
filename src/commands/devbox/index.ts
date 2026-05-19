import { Command } from 'commander'
import chalk from 'chalk'
import { createDevboxClient } from '../../lib/api-client.ts'
import { type ApiErrorBody, mapApiError } from '../../lib/errors.ts'
import { outputJson, outputTable } from '../../lib/output.ts'
import { withAuth } from '../../lib/with-auth.ts'

const PORT_PROTOCOLS = ['http', 'grpc', 'ws'] as const

type PortProtocol = typeof PORT_PROTOCOLS[number]

interface DevboxPortOptions {
  portName?: string
  number?: number
  protocol?: PortProtocol
  isPublic?: boolean
  customDomain?: string
}

interface DevboxCreateOptions {
  name: string
  runtime?: string
  template?: string
  cpu: string
  memory: string
  port: string[]
  env: string[]
  secretEnv: string[]
  autostart?: boolean
}

interface DevboxUpdateOptions {
  cpu?: string
  memory?: string
  port: string[]
}

interface DevboxReleaseOptions {
  tag: string
  description?: string
  execCommand?: string
  noStart?: boolean
}

function formatValue (value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

function collectOption (value: string, previous: string[]): string[] {
  return [...previous, value]
}

export function parseNumericValue (value: string, field: string): number {
  const normalized = value.trim().toLowerCase()
  let raw = normalized

  if (field === 'cpu' && normalized.endsWith('c')) {
    raw = normalized.slice(0, -1)
  }
  if (field === 'memory' && /gi?$|gb$|g$/i.test(normalized)) {
    raw = normalized.replace(/gi?$|gb$|g$/i, '')
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${field} value "${value}"`)
  }
  if (parsed < 0.1 || parsed > 32) {
    throw new Error(`${field} must be between 0.1 and 32`)
  }
  return parsed
}

function parseBooleanValue (value: string, field: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (['true', 'yes', '1', 'public'].includes(normalized)) return true
  if (['false', 'no', '0', 'private'].includes(normalized)) return false
  throw new Error(`Invalid ${field} boolean value "${value}"`)
}

function normalizeProtocol (value?: string): PortProtocol | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (!PORT_PROTOCOLS.includes(normalized as PortProtocol)) {
    throw new Error(`Invalid port protocol "${value}". Use one of: ${PORT_PROTOCOLS.join(', ')}`)
  }
  return normalized as PortProtocol
}

export function parsePortSpec (spec: string): DevboxPortOptions {
  if (!spec) {
    throw new Error('Port spec is required.')
  }

  if (spec.includes('=')) {
    const port: DevboxPortOptions = {}
    for (const pair of spec.split(',')) {
      const index = pair.indexOf('=')
      if (index === -1) {
        throw new Error(`Invalid port spec "${spec}". Expected comma-separated KEY=VALUE pairs.`)
      }
      const key = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      switch (key) {
        case 'portName':
          port.portName = value
          break
        case 'number':
          port.number = parsePortNumber(value)
          break
        case 'protocol':
          port.protocol = normalizeProtocol(value)
          break
        case 'isPublic':
          port.isPublic = parseBooleanValue(value, 'isPublic')
          break
        case 'customDomain':
          port.customDomain = value
          break
        default:
          throw new Error(`Unsupported port field "${key}"`)
      }
    }
    return port
  }

  const [rawNumber, rawProtocol, rawVisibility, customDomain] = spec.split(':')
  const port: DevboxPortOptions = {
    number: parsePortNumber(rawNumber || '')
  }
  const protocol = normalizeProtocol(rawProtocol)
  if (protocol) port.protocol = protocol
  if (rawVisibility) port.isPublic = parseBooleanValue(rawVisibility, 'visibility')
  if (customDomain) port.customDomain = customDomain
  return port
}

function parsePortNumber (value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port number "${value}"`)
  }
  return parsed
}

function parseEnvArgs (envs: string[]): Array<{ name: string; value: string }> {
  return envs.map(env => {
    const index = env.indexOf('=')
    if (index === -1) {
      throw new Error(`Invalid --env format: "${env}". Expected NAME=VALUE`)
    }
    const name = env.slice(0, index)
    if (!name) {
      throw new Error(`Invalid --env format: "${env}". Environment name is required.`)
    }
    return {
      name,
      value: env.slice(index + 1)
    }
  })
}

function parseSecretEnvArgs (envs: string[]): Array<{ name: string; valueFrom: { secretKeyRef: { name: string; key: string } } }> {
  return envs.map(env => {
    const index = env.indexOf('=')
    if (index === -1) {
      throw new Error(`Invalid --secret-env format: "${env}". Expected NAME=SECRET:KEY`)
    }
    const name = env.slice(0, index)
    const [secretName, secretKey] = env.slice(index + 1).split(':')
    if (!name || !secretName || !secretKey) {
      throw new Error(`Invalid --secret-env format: "${env}". Expected NAME=SECRET:KEY`)
    }
    return {
      name,
      valueFrom: {
        secretKeyRef: {
          name: secretName,
          key: secretKey
        }
      }
    }
  })
}

function requireRuntime (options: Pick<DevboxCreateOptions, 'runtime' | 'template'>): string {
  const runtime = options.runtime || options.template
  if (!runtime) {
    throw new Error('Devbox runtime is required. Use --runtime <runtime>.')
  }
  return runtime
}

export function buildCreateDevboxBody (options: DevboxCreateOptions) {
  return {
    name: options.name,
    runtime: requireRuntime(options),
    quota: {
      cpu: parseNumericValue(options.cpu, 'cpu'),
      memory: parseNumericValue(options.memory, 'memory')
    },
    ports: options.port.map(parsePortSpec),
    env: [
      ...parseEnvArgs(options.env),
      ...parseSecretEnvArgs(options.secretEnv)
    ],
    autostart: options.autostart ?? false
  }
}

export function buildUpdateDevboxBody (options: DevboxUpdateOptions) {
  const body: {
    quota?: { cpu?: number; memory?: number }
    ports?: DevboxPortOptions[]
  } = {}

  if (options.cpu || options.memory) {
    body.quota = {}
    if (options.cpu) body.quota.cpu = parseNumericValue(options.cpu, 'cpu')
    if (options.memory) body.quota.memory = parseNumericValue(options.memory, 'memory')
  }

  if (options.port.length > 0) {
    body.ports = options.port.map(parsePortSpec)
  }

  if (!body.quota && !body.ports) {
    throw new Error('Provide at least one of --cpu, --memory, or --port.')
  }

  return body
}

export function buildReleaseBody (options: DevboxReleaseOptions) {
  const body: {
    tag: string
    releaseDescription?: string
    execCommand?: string
    startDevboxAfterRelease?: boolean
  } = {
    tag: options.tag
  }
  if (options.description !== undefined) body.releaseDescription = options.description
  if (options.execCommand !== undefined) body.execCommand = options.execCommand
  if (options.noStart) body.startDevboxAfterRelease = false
  return body
}

function printDevboxList (items: any[]): void {
  if (items.length === 0) {
    console.log('No devboxes found.')
    return
  }
  outputTable([
    [chalk.bold('Name'), chalk.bold('Runtime'), chalk.bold('Status'), chalk.bold('CPU'), chalk.bold('Memory'), chalk.bold('UID')],
    ...items.map(item => [
      formatValue(item.name),
      formatValue(item.runtime),
      formatValue(item.status),
      item.quota?.cpu != null ? `${item.quota.cpu} vCPU` : '-',
      item.quota?.memory != null ? `${item.quota.memory} GB` : '-',
      formatValue(item.uid)
    ])
  ])
}

function printDevboxDetail (devbox: any): void {
  outputTable([
    [chalk.bold('Field'), chalk.bold('Value')],
    ['Name', formatValue(devbox.name)],
    ['Runtime', formatValue(devbox.runtime)],
    ['Status', formatValue(devbox.status)],
    ['CPU', devbox.quota?.cpu != null ? `${devbox.quota.cpu} vCPU` : '-'],
    ['Memory', devbox.quota?.memory != null ? `${devbox.quota.memory} GB` : '-'],
    ['Working Dir', formatValue(devbox.workingDir)],
    ['SSH User', formatValue(devbox.userName)],
    ['SSH Port', formatValue(devbox.sshPort)],
    ['Domain', formatValue(devbox.domain)]
  ])

  if (devbox.ports?.length > 0) {
    console.log(chalk.dim('\n  Ports:'))
    outputTable([
      [chalk.bold('Name'), chalk.bold('Number'), chalk.bold('Protocol'), chalk.bold('Public'), chalk.bold('Public Domain'), chalk.bold('Private Address')],
      ...devbox.ports.map((port: any) => [
        formatValue(port.portName),
        formatValue(port.number),
        formatValue(port.protocol),
        formatValue(port.isPublic),
        formatValue(port.publicDomain),
        formatValue(port.privateAddress)
      ])
    ])
  }

  if (devbox.pods?.length > 0) {
    console.log(chalk.dim('\n  Pods:'))
    outputTable([
      [chalk.bold('Name'), chalk.bold('Status')],
      ...devbox.pods.map((pod: any) => [formatValue(pod.name), formatValue(pod.status)])
    ])
  }
}

function printCreateResult (devbox: any): void {
  console.log(chalk.dim(`  Name:        ${formatValue(devbox.name)}`))
  console.log(chalk.dim(`  SSH:         ${formatValue(devbox.userName)}@${formatValue(devbox.domain)}:${formatValue(devbox.sshPort)}`))
  console.log(chalk.dim(`  Working Dir: ${formatValue(devbox.workingDir)}`))
  if (devbox.autostarted !== undefined) {
    console.log(chalk.dim(`  Autostarted: ${formatValue(devbox.autostarted)}`))
  }
  if (devbox.ports?.length > 0) {
    console.log(chalk.dim('\n  Ports:'))
    outputTable([
      [chalk.bold('Number'), chalk.bold('Protocol'), chalk.bold('Public'), chalk.bold('Public Domain'), chalk.bold('Private Address')],
      ...devbox.ports.map((port: any) => [
        formatValue(port.number),
        formatValue(port.protocol),
        formatValue(port.isPublic),
        formatValue(port.publicDomain),
        formatValue(port.privateAddress)
      ])
    ])
  }
}

function printReleases (releases: any[]): void {
  if (releases.length === 0) {
    console.log('No releases found.')
    return
  }
  outputTable([
    [chalk.bold('Tag'), chalk.bold('Name'), chalk.bold('Created'), chalk.bold('Image'), chalk.bold('Description')],
    ...releases.map(release => [
      formatValue(release.tag),
      formatValue(release.name),
      formatValue(release.createdAt),
      formatValue(release.image),
      formatValue(release.description)
    ])
  ])
}

function printDeployments (deployments: any[]): void {
  if (deployments.length === 0) {
    console.log('No deployments found.')
    return
  }
  outputTable([
    [chalk.bold('Name'), chalk.bold('Type'), chalk.bold('Tag')],
    ...deployments.map(deployment => [
      formatValue(deployment.name),
      formatValue(deployment.resourceType),
      formatValue(deployment.tag)
    ])
  ])
}

function printMonitor (samples: any[]): void {
  if (samples.length === 0) {
    console.log('No monitor samples found.')
    return
  }
  outputTable([
    [chalk.bold('Time'), chalk.bold('CPU %'), chalk.bold('Memory %'), chalk.bold('Timestamp')],
    ...samples.map(sample => [
      formatValue(sample.readableTime),
      formatValue(sample.cpu),
      formatValue(sample.memory),
      formatValue(sample.timestamp)
    ])
  ])
}

function printTemplates (templates: any[]): void {
  if (templates.length === 0) {
    console.log('No devbox templates found.')
    return
  }
  outputTable([
    [chalk.bold('Runtime'), chalk.bold('User'), chalk.bold('Working Dir'), chalk.bold('App Ports'), chalk.bold('Ports')],
    ...templates.map(template => [
      formatValue(template.runtime),
      formatValue(template.config?.user),
      formatValue(template.config?.workingDir),
      Array.isArray(template.config?.appPorts) ? String(template.config.appPorts.length) : '-',
      Array.isArray(template.config?.ports) ? String(template.config.ports.length) : '-'
    ])
  ])
}

export function createDevboxCommand (): Command {
  const devboxCmd = new Command('devbox')
    .alias('dev')
    .description('Manage devbox instances')

  devboxCmd
    .command('list')
    .description('List all devboxes')
    .option('-o, --output <format>', 'Output format (json|table)', 'table')
    .action(withAuth({ spinnerText: 'Loading devboxes...' }, async (ctx, options: { output: string }) => {
      const client = createDevboxClient()
      const { data, error, response } = await client.GET('/devbox', {
        headers: ctx.auth
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }
      printDevboxList(data)
    }))

  devboxCmd
    .command('create')
    .description('Create a new devbox')
    .requiredOption('--name <name>', 'Devbox name')
    .option('--runtime <runtime>', 'Runtime environment name')
    .option('--template <runtime>', 'Alias for --runtime')
    .option('--cpu <cpu>', 'CPU cores', '1')
    .option('--memory <memory>', 'Memory in GB', '2')
    .option('--port <spec>', 'Port spec, e.g. 8080:http:public or number=8080,protocol=http', collectOption, [] as string[])
    .option('--env <NAME=VALUE>', 'Environment variable', collectOption, [] as string[])
    .option('--secret-env <NAME=SECRET:KEY>', 'Environment variable from secret', collectOption, [] as string[])
    .option('--autostart', 'Auto start devbox after creation')
    .option('-o, --output <format>', 'Output format (json|table)', 'table')
    .action(withAuth({ spinnerText: 'Creating devbox...' }, async (ctx, options: DevboxCreateOptions & { output: string }) => {
      const client = createDevboxClient()
      const { data, error, response } = await client.POST('/devbox', {
        headers: ctx.auth,
        body: buildCreateDevboxBody(options) as any
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson(data)
        return
      }
      ctx.spinner.succeed(`Devbox "${data.name}" created`)
      printCreateResult(data)
    }))

  devboxCmd
    .command('get <name>')
    .description('Get devbox details')
    .option('-o, --output <format>', 'Output format (json|table)', 'table')
    .action(withAuth({ spinnerText: 'Loading devbox...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDevboxClient()
      const { data, error, response } = await client.GET('/devbox/{name}', {
        headers: ctx.auth,
        params: {
          path: { name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }
      printDevboxDetail(data)
    }))

  devboxCmd
    .command('update <name>')
    .description('Update devbox resources or ports')
    .option('--cpu <cpu>', 'CPU cores')
    .option('--memory <memory>', 'Memory in GB')
    .option('--port <spec>', 'Port spec. Existing ports can include portName=...', collectOption, [] as string[])
    .action(withAuth({ spinnerText: 'Updating devbox...' }, async (ctx, name: string, options: DevboxUpdateOptions) => {
      const client = createDevboxClient()
      const { error, response } = await client.PATCH('/devbox/{name}', {
        headers: ctx.auth,
        params: {
          path: { name }
        },
        body: buildUpdateDevboxBody(options) as any
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.succeed(`Devbox "${name}" update requested`)
    }))

  devboxCmd
    .command('delete <name>')
    .description('Delete a devbox')
    .alias('rm')
    .action(withAuth({ spinnerText: 'Deleting devbox...' }, async (ctx, name: string) => {
      const client = createDevboxClient()
      const { error, response } = await client.DELETE('/devbox/{name}', {
        headers: ctx.auth,
        params: {
          path: { name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.succeed(`Devbox "${name}" deleted`)
    }))

  const lifecycleActions = [
    { name: 'start', endpoint: '/devbox/{name}/start' as const, spinnerText: 'Starting devbox...', done: 'start requested' },
    { name: 'pause', endpoint: '/devbox/{name}/pause' as const, spinnerText: 'Pausing devbox...', done: 'pause requested', alias: 'stop' },
    { name: 'shutdown', endpoint: '/devbox/{name}/shutdown' as const, spinnerText: 'Shutting down devbox...', done: 'shutdown requested' },
    { name: 'restart', endpoint: '/devbox/{name}/restart' as const, spinnerText: 'Restarting devbox...', done: 'restart requested' }
  ]

  for (const action of lifecycleActions) {
    const command = devboxCmd
      .command(`${action.name} <name>`)
      .description(`${action.name.charAt(0).toUpperCase()}${action.name.slice(1)} a devbox`)

    if (action.alias) command.alias(action.alias)

    command.action(withAuth({ spinnerText: action.spinnerText }, async (ctx, name: string) => {
      const client = createDevboxClient()
      const { error, response } = await client.POST(action.endpoint, {
        headers: ctx.auth,
        params: {
          path: { name }
        },
        body: {}
      } as any)

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.succeed(`Devbox "${name}" ${action.done}`)
    }))
  }

  devboxCmd
    .command('autostart <name>')
    .description('Configure devbox autostart')
    .option('--exec-command <command>', 'Command to execute when the devbox starts')
    .action(withAuth({ spinnerText: 'Configuring autostart...' }, async (ctx, name: string, options: { execCommand?: string }) => {
      const client = createDevboxClient()
      const body = options.execCommand ? { execCommand: options.execCommand } : {}
      const { error, response } = await client.POST('/devbox/{name}/autostart', {
        headers: ctx.auth,
        params: {
          path: { name }
        },
        body
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.succeed(`Autostart configured for "${name}"`)
    }))

  devboxCmd
    .command('monitor <name>')
    .description('Get devbox monitoring data')
    .option('--start <timestamp>', 'Start timestamp in seconds or milliseconds')
    .option('--end <timestamp>', 'End timestamp in seconds or milliseconds')
    .option('--step <step>', 'Sampling interval, e.g. 2m')
    .option('-o, --output <format>', 'Output format (json|table)', 'table')
    .action(withAuth({ spinnerText: 'Loading monitor data...' }, async (
      ctx,
      name: string,
      options: { start?: string; end?: string; step?: string; output: string }
    ) => {
      const client = createDevboxClient()
      const { data, error, response } = await client.GET('/devbox/{name}/monitor', {
        headers: ctx.auth,
        params: {
          path: { name },
          query: {
            ...(options.start ? { start: options.start } : {}),
            ...(options.end ? { end: options.end } : {}),
            ...(options.step ? { step: options.step } : {})
          }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }
      printMonitor(data)
    }))

  devboxCmd
    .command('templates')
    .description('List available devbox templates')
    .option('-o, --output <format>', 'Output format (json|table)', 'table')
    .action(withAuth({ spinnerText: 'Loading devbox templates...' }, async (ctx, options: { output: string }) => {
      const client = createDevboxClient()
      const { data, error, response } = await client.GET('/devbox/templates', {
        headers: ctx.auth
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }
      printTemplates(data)
    }))

  const releasesCommand = devboxCmd
    .command('releases')
    .description('Manage devbox releases')

  releasesCommand
    .command('list <name>')
    .description('List devbox releases')
    .option('-o, --output <format>', 'Output format (json|table)', 'table')
    .action(withAuth({ spinnerText: 'Loading releases...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDevboxClient()
      const { data, error, response } = await client.GET('/devbox/{name}/releases', {
        headers: ctx.auth,
        params: {
          path: { name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }
      printReleases(data)
    }))

  releasesCommand
    .command('create <name>')
    .description('Create a devbox release')
    .requiredOption('--tag <tag>', 'Release tag')
    .option('--description <description>', 'Release description')
    .option('--exec-command <command>', 'Autostart command after release restart')
    .option('--no-start', 'Keep devbox stopped after the release build completes')
    .action(withAuth({ spinnerText: 'Creating release...' }, async (ctx, name: string, options: DevboxReleaseOptions) => {
      const client = createDevboxClient()
      const { data, error, response } = await client.POST('/devbox/{name}/releases', {
        headers: ctx.auth,
        params: {
          path: { name }
        },
        body: buildReleaseBody(options)
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.succeed(`Release "${options.tag}" accepted for "${data.name}" (${data.status})`)
    }))

  releasesCommand
    .command('delete <name> <tag>')
    .alias('rm')
    .description('Delete a devbox release')
    .action(withAuth({ spinnerText: 'Deleting release...' }, async (ctx, name: string, tag: string) => {
      const client = createDevboxClient()
      const { error, response } = await client.DELETE('/devbox/{name}/releases/{tag}', {
        headers: ctx.auth,
        params: {
          path: { name, tag }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.succeed(`Release "${tag}" deleted for "${name}"`)
    }))

  releasesCommand
    .command('deploy <name> <tag>')
    .description('Deploy a release to AppLaunchpad')
    .action(withAuth({ spinnerText: 'Deploying release...' }, async (ctx, name: string, tag: string) => {
      const client = createDevboxClient()
      const { error, response } = await client.POST('/devbox/{name}/releases/{tag}/deploy', {
        headers: ctx.auth,
        params: {
          path: { name, tag }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.succeed(`Release "${tag}" deployed for "${name}"`)
    }))

  devboxCmd
    .command('deployments <name>')
    .description('List deployed applications from a devbox')
    .option('-o, --output <format>', 'Output format (json|table)', 'table')
    .action(withAuth({ spinnerText: 'Loading deployments...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDevboxClient()
      const { data, error, response } = await client.GET('/devbox/{name}/deployments', {
        headers: ctx.auth,
        params: {
          path: { name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }
      printDeployments(data)
    }))

  return devboxCmd
}
