import { Command } from 'commander'
import chalk from 'chalk'
import { createDatabaseClient, resolveDbproviderHost } from '../../lib/api-client.ts'
import { DEFAULT_SEALOS_REGION, loadAuth } from '../../lib/auth.ts'
import { type ApiErrorBody, mapApiError } from '../../lib/errors.ts'
import { normalizeSealosUrl } from '../../lib/hosts.ts'
import { outputJson, outputTable } from '../../lib/output.ts'
import { withAuth, withErrorHandling } from '../../lib/with-auth.ts'

const SUPPORTED_DATABASE_TYPES = [
  'postgresql',
  'mongodb',
  'apecloud-mysql',
  'mysql',
  'redis',
  'kafka',
  'qdrant',
  'nebula',
  'weaviate',
  'milvus',
  'pulsar',
  'clickhouse'
] as const

const SUPPORTED_LOG_DB_TYPES = [
  'postgresql',
  'mongodb',
  'mysql',
  'redis'
] as const

const SUPPORTED_LOG_TYPES = [
  'runtimeLog',
  'slowQuery',
  'errorLog'
] as const

type DatabaseType = typeof SUPPORTED_DATABASE_TYPES[number]
type LogDbType = typeof SUPPORTED_LOG_DB_TYPES[number]
type LogType = typeof SUPPORTED_LOG_TYPES[number]

interface LegacyApiResponse<T> {
  code: number
  message?: string
  data?: T
  error?: unknown
}

interface SecretResponse {
  username: string
  password: string
  host: string
  port: string
  connection: string
}

interface ClientAppConfigResponse {
  domain?: string
}

interface ServiceResponse {
  spec?: {
    ports?: Array<{
      nodePort?: number
      port?: number
    }>
  }
}

interface ConnectionDetails {
  privateConnection?: {
    endpoint?: string
    host?: string
    port?: string
    username?: string
    password?: string
    connectionString?: string
  } | null
  publicConnection?: string | null
}

export function collectOption (value: string, previous: string[]): string[] {
  return [...previous, value]
}

export function parseKeyValueArgs (pairs: string[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const pair of pairs) {
    const index = pair.indexOf('=')
    if (index === -1) {
      throw new Error(`Invalid KEY=VALUE format: "${pair}"`)
    }
    values[pair.slice(0, index)] = pair.slice(index + 1)
  }
  return values
}

export function normalizeDatabaseType (type: string): DatabaseType {
  const normalized = type.trim().toLowerCase()
  const aliases: Record<string, DatabaseType> = {
    postgres: 'postgresql',
    postgresql: 'postgresql',
    mongo: 'mongodb',
    mongodb: 'mongodb'
  }

  const resolved = aliases[normalized] || (normalized as DatabaseType)
  if (!SUPPORTED_DATABASE_TYPES.includes(resolved)) {
    throw new Error(`Unsupported database type "${type}"`)
  }

  return resolved
}

function getDatabaseConnectScheme (type: string): string {
  const databaseType = normalizeDatabaseType(type)
  const schemes: Record<DatabaseType, string> = {
    postgresql: 'postgresql',
    mongodb: 'mongodb',
    'apecloud-mysql': 'mysql',
    mysql: 'mysql',
    redis: 'redis',
    kafka: 'kafka',
    qdrant: 'qdrant',
    nebula: 'nebula',
    weaviate: 'weaviate',
    milvus: 'milvus',
    pulsar: 'pulsar',
    clickhouse: 'clickhouse'
  }

  return schemes[databaseType]
}

export function buildConsolePublicConnection (options: {
  dbType: string
  username?: string
  password?: string
  domain?: string
  nodePort?: number | string | null
}): string | null {
  if (!options.domain || !options.nodePort) return null

  const scheme = getDatabaseConnectScheme(options.dbType)
  const port = String(options.nodePort)

  if (scheme === 'kafka' || scheme === 'milvus') {
    return `${options.domain}:${port}`
  }

  if (!options.username || !options.password) return null

  let connection = `${scheme}://${options.username}:${options.password}@${options.domain}:${port}`
  if (scheme === 'mongodb' || scheme === 'postgresql') {
    connection += '/?directConnection=true'
  }

  return connection
}

function extractConnectionHost (connection: string): string | null {
  try {
    return new URL(connection).hostname || null
  } catch {
    const withoutScheme = connection.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    const afterCredentials = withoutScheme.includes('@') ? withoutScheme.slice(withoutScheme.lastIndexOf('@') + 1) : withoutScheme
    const withoutPath = afterCredentials.split(/[/?#]/, 1)[0] ?? ''

    if (withoutPath.startsWith('[')) {
      const end = withoutPath.indexOf(']')
      return end === -1 ? null : withoutPath.slice(1, end)
    }

    return withoutPath.split(':', 1)[0] || null
  }
}

function isInternalConnectionHost (host: string): boolean {
  const normalized = host.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true
  if (normalized.endsWith('.svc') || normalized.includes('.svc.')) return true
  if (normalized.endsWith('.cluster.local') || normalized.endsWith('.local')) return true
  if (normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) return true

  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false

  const octets = ipv4.slice(1).map(Number)
  if (octets.some(octet => octet < 0 || octet > 255)) return false

  const first = octets[0]
  const second = octets[1]
  if (first === undefined || second === undefined) return false

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    (first === 100 && second >= 64 && second <= 127)
  )
}

export function resolveConsolePublicConnection (options: {
  dbType: string
  username?: string
  password?: string
  domain?: string
  service?: ServiceResponse | null
  fallbackPublicConnection?: string | null
}): string | null {
  const nodePort = options.service?.spec?.ports?.find(port => port.nodePort)?.nodePort
  if (!nodePort) return null

  const connection = buildConsolePublicConnection({
    dbType: options.dbType,
    username: options.username,
    password: options.password,
    domain: options.domain,
    nodePort
  })

  if (connection) return connection

  const fallbackHost = options.fallbackPublicConnection ? extractConnectionHost(options.fallbackPublicConnection) : null
  if (options.fallbackPublicConnection && fallbackHost && !isInternalConnectionHost(fallbackHost)) {
    return options.fallbackPublicConnection
  }

  return null
}

export function normalizeLogDbType (type: string): LogDbType {
  const normalized = normalizeDatabaseType(type)
  if (!SUPPORTED_LOG_DB_TYPES.includes(normalized as LogDbType)) {
    throw new Error(`Logs API only supports db types: ${SUPPORTED_LOG_DB_TYPES.join(', ')}`)
  }

  return normalized as LogDbType
}

export function normalizeLogType (type: string): LogType {
  const normalized = type.trim() as LogType
  if (!SUPPORTED_LOG_TYPES.includes(normalized)) {
    throw new Error(`Unsupported log type "${type}". Use one of: ${SUPPORTED_LOG_TYPES.join(', ')}`)
  }

  return normalized
}

export function parseNumericValue (value: string, field: string): number {
  const normalized = value.trim().toLowerCase()
  let raw = normalized

  if (field === 'cpu' && normalized.endsWith('c')) {
    raw = normalized.slice(0, -1)
  }

  if ((field === 'memory' || field === 'storage') && /gi?$|gb$|g$/i.test(normalized)) {
    raw = normalized.replace(/gi?$|gb$|g$/i, '')
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${field} value "${value}"`)
  }

  return parsed
}

export function parseIntegerValue (value: string, field: string): number {
  const parsed = parseNumericValue(value, field)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${field} must be an integer`)
  }
  return parsed
}

export function buildQuota (options: { cpu?: string; memory?: string; storage?: string; replicas?: string }): Record<string, number> {
  const quota: Record<string, number> = {}

  if (options.cpu !== undefined) quota.cpu = parseNumericValue(options.cpu, 'cpu')
  if (options.memory !== undefined) quota.memory = parseNumericValue(options.memory, 'memory')
  if (options.storage !== undefined) quota.storage = parseNumericValue(options.storage, 'storage')
  if (options.replicas !== undefined) quota.replicas = parseIntegerValue(options.replicas, 'replicas')

  return quota
}

export function buildAutoBackup (options: {
  backupStart?: boolean
  backupType?: string
  backupWeek: string[]
  backupHour?: string
  backupMinute?: string
  backupSaveTime?: string
  backupSaveType?: string
}): Record<string, unknown> | undefined {
  const autoBackup: Record<string, unknown> = {}

  if (options.backupStart) autoBackup.start = true
  if (options.backupType) autoBackup.type = options.backupType
  if (options.backupWeek.length > 0) autoBackup.week = options.backupWeek
  if (options.backupHour) autoBackup.hour = options.backupHour
  if (options.backupMinute) autoBackup.minute = options.backupMinute
  if (options.backupSaveTime) autoBackup.saveTime = parseIntegerValue(options.backupSaveTime, 'backup-save-time')
  if (options.backupSaveType) autoBackup.saveType = options.backupSaveType

  return Object.keys(autoBackup).length > 0 ? autoBackup : undefined
}

function formatValue (value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

export function summarizeVersions (versions: string[]): string {
  if (versions.length <= 3) return versions.join(', ')
  return `${versions.slice(0, 3).join(', ')} ... (${versions.length} total)`
}

export function extractVersionsMap (payload: any): Record<string, string[]> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
      return payload.data as Record<string, string[]>
    }

    return payload as Record<string, string[]>
  }

  throw new Error('Unexpected versions response shape')
}

function printDatabaseDetail (database: any): void {
  console.log(chalk.bold(`\n  ${database.name}\n`))
  console.log(`  ${chalk.dim('Type:')}                ${formatValue(database.type)}`)
  console.log(`  ${chalk.dim('Version:')}             ${formatValue(database.version)}`)
  console.log(`  ${chalk.dim('Status:')}              ${formatValue(database.status)}`)
  console.log(`  ${chalk.dim('Created:')}             ${formatValue(database.createdAt)}`)
  console.log(`  ${chalk.dim('Termination policy:')}  ${formatValue(database.terminationPolicy)}`)
  console.log(`  ${chalk.dim('UID:')}                 ${formatValue(database.uid)}`)
  console.log(`  ${chalk.dim('Resource type:')}       ${formatValue(database.resourceType)}`)

  if (database.quota) {
    console.log(`\n  ${chalk.dim('Resources:')}`)
    console.log(`    CPU:       ${formatValue(database.quota.cpu)} core(s)`)
    console.log(`    Memory:    ${formatValue(database.quota.memory)} GB`)
    console.log(`    Storage:   ${formatValue(database.quota.storage)} GB`)
    console.log(`    Replicas:  ${formatValue(database.quota.replicas)}`)
  }

  if (database.connection) {
    const privateReady = database.connection.privateConnection != null
    const publicReady = database.connection.publicConnection != null
    console.log(`\n  ${chalk.dim('Connectivity:')}`)
    console.log(`    Private:   ${privateReady ? 'available' : 'not ready'}`)
    console.log(`    Public:    ${publicReady ? 'enabled' : 'disabled'}`)
  }

  if (database.autoBackup) {
    console.log(`\n  ${chalk.dim('Auto backup:')}`)
    console.log(`    Enabled:   ${database.autoBackup.start ? 'yes' : 'no'}`)
    if (database.autoBackup.type) {
      console.log(`    Schedule:  ${database.autoBackup.type}`)
    }
    if (database.autoBackup.week?.length) {
      console.log(`    Weekdays:  ${database.autoBackup.week.join(', ')}`)
    }
    if (database.autoBackup.hour || database.autoBackup.minute) {
      console.log(`    Time:      ${formatValue(database.autoBackup.hour)}:${formatValue(database.autoBackup.minute)}`)
    }
    if (database.autoBackup.saveTime || database.autoBackup.saveType) {
      console.log(`    Retention: ${formatValue(database.autoBackup.saveTime)} ${formatValue(database.autoBackup.saveType)}`)
    }
  }

  const params = database.parameterConfig ? Object.entries(database.parameterConfig).filter(([, value]) => value !== undefined && value !== null && value !== '') : []
  if (params.length > 0) {
    console.log(`\n  ${chalk.dim('Parameters:')}`)
    const rows: string[][] = [[chalk.bold('Key'), chalk.bold('Value')]]
    for (const [key, value] of params) {
      rows.push([key, formatValue(value)])
    }
    outputTable(rows)
  }

  if (database.pods?.length > 0) {
    console.log(`\n  ${chalk.dim('Pods:')}`)
    const rows: string[][] = [[chalk.bold('Name'), chalk.bold('Status')]]
    for (const pod of database.pods) {
      rows.push([formatValue(pod.name), formatValue(pod.status)])
    }
    outputTable(rows)
  }
}

function printConnectionDetail (connection: any): void {
  const rows: string[][] = [[chalk.bold('Field'), chalk.bold('Value')]]
  const privateConnection = connection?.privateConnection
  const publicConnection = connection?.publicConnection

  if (privateConnection && typeof privateConnection === 'object') {
    rows.push(['Private endpoint', formatValue(privateConnection.endpoint)])
    rows.push(['Private host', formatValue(privateConnection.host)])
    rows.push(['Private port', formatValue(privateConnection.port)])
    rows.push(['Username', formatValue(privateConnection.username)])
    rows.push(['Password', formatValue(privateConnection.password)])
    rows.push(['Connection string', formatValue(privateConnection.connectionString)])
  }

  if (publicConnection !== undefined && publicConnection !== null) {
    rows.push(['Public connection', formatValue(publicConnection)])
  }

  if (rows.length === 1) {
    console.log('Connection information is not available yet.')
    return
  }

  outputTable(rows)
}

function buildPublicAccessResult (action: 'enable-public' | 'disable-public', name: string, connection?: ConnectionDetails | null): Record<string, unknown> {
  return {
    success: true,
    action,
    resource: 'database',
    name,
    status: action === 'enable-public' ? 'enabled' : 'disabled',
    publicConnection: connection?.publicConnection ?? null,
    connection: connection ?? null
  }
}

function getDatabaseProviderHost (): string {
  const override = process.env.SEALOS_DATABASE_HOST?.trim()
  if (override) {
    return normalizeSealosUrl(override, 'SEALOS_DATABASE_HOST')
  }

  let authRegion: string | undefined
  try {
    authRegion = loadAuth().region
  } catch {
    authRegion = undefined
  }

  return resolveDbproviderHost(process.env.SEALOS_REGION || authRegion || DEFAULT_SEALOS_REGION)
}

async function getLegacyApiData<T> (path: string, headers: { Authorization: string }): Promise<T> {
  const url = new URL(path, getDatabaseProviderHost())
  const response = await fetch(url, {
    headers: {
      Authorization: headers.Authorization
    }
  })
  const body = await response.json() as LegacyApiResponse<T>

  if (!response.ok || body.code !== 200) {
    throw new Error(body.message || `Request failed: ${url.pathname}`)
  }

  return body.data as T
}

async function fetchConsoleConnectionDetails (
  name: string,
  dbType: string,
  fallbackConnection: ConnectionDetails | null | undefined,
  headers: { Authorization: string }
): Promise<ConnectionDetails> {
  const [secret, service, config] = await Promise.all([
    getLegacyApiData<SecretResponse>(`/api/getSecretByName?dbName=${encodeURIComponent(name)}&dbType=${encodeURIComponent(dbType)}&mock=false`, headers),
    getLegacyApiData<ServiceResponse>(`/api/getServiceByName?name=${encodeURIComponent(`${name}-export`)}`, headers).catch(() => null),
    getLegacyApiData<ClientAppConfigResponse>('/api/platform/getClientAppConfig', headers).catch(() => null)
  ])

  const publicConnection = resolveConsolePublicConnection({
    dbType,
    username: secret.username,
    password: secret.password,
    domain: config?.domain,
    service,
    fallbackPublicConnection: fallbackConnection?.publicConnection
  })

  return {
    privateConnection: {
      endpoint: `${secret.host}:${secret.port}`,
      host: secret.host,
      port: secret.port,
      username: secret.username,
      password: secret.password,
      connectionString: secret.connection
    },
    publicConnection
  }
}

async function resolveDatabaseConnection (database: any, headers: { Authorization: string }): Promise<ConnectionDetails | null> {
  if (!database?.type) return database?.connection ?? null

  return await fetchConsoleConnectionDetails(database.name, database.type, database.connection, headers)
}

async function loadDatabaseConnectionDetails (
  name: string,
  headers: { Authorization: string }
): Promise<ConnectionDetails | null> {
  const client = createDatabaseClient()
  const { data, error, response } = await client.GET('/databases/{databaseName}', {
    headers,
    params: {
      path: { databaseName: name }
    }
  })

  if (error) throw mapApiError(response.status, error as ApiErrorBody)

  return await resolveDatabaseConnection(data, headers)
}

export function createDatabaseCommand (): Command {
  const dbCmd = new Command('database')
    .alias('db')
    .description('Manage databases')

  dbCmd
    .command('list')
    .description('List databases')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Loading databases...' }, async (ctx, options: { output: string }) => {
      const client = createDatabaseClient()
      const { data, error, response } = await client.GET('/databases', {
        headers: ctx.auth
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }

      if (data.length === 0) {
        console.log('No databases found.')
        return
      }

      const rows: string[][] = [[
        chalk.bold('Name'),
        chalk.bold('Type'),
        chalk.bold('Version'),
        chalk.bold('Status'),
        chalk.bold('CPU'),
        chalk.bold('Memory'),
        chalk.bold('Storage'),
        chalk.bold('Replicas')
      ]]

      for (const database of data) {
        rows.push([
          formatValue(database.name),
          formatValue(database.type),
          formatValue(database.version),
          formatValue(database.status),
          formatValue(database.quota?.cpu),
          formatValue(database.quota?.memory),
          formatValue(database.quota?.storage),
          formatValue(database.quota?.replicas)
        ])
      }

      outputTable(rows)
    }))

  dbCmd
    .command('versions')
    .description('List supported database versions (public endpoint)')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .option('--host <host>', 'Sealos region host for public version lookup, e.g. https://gzg.sealos.run')
    .option('--type <type>', 'Filter versions by database type')
    .action(withErrorHandling({ spinnerText: 'Loading versions...' }, async (ctx, options: { output: string; host?: string; type?: string }) => {
      const client = createDatabaseClient({ baseUrl: options.host })
      const { data, error, response } = await client.GET('/databases/versions')

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      ctx.spinner.stop()

      if (options.output === 'json') {
        if (!options.type) {
          outputJson(data)
          return
        }

        const versionsMap = extractVersionsMap(data)
        const databaseType = normalizeDatabaseType(options.type)
        outputJson({ [databaseType]: versionsMap[databaseType] ?? [] })
        return
      }

      const versionsMap = extractVersionsMap(data)
      if (options.type) {
        const databaseType = normalizeDatabaseType(options.type)
        const versions = versionsMap[databaseType] ?? []
        if (versions.length === 0) {
          console.log(`No versions found for database type "${databaseType}".`)
          return
        }

        const rows: string[][] = [[chalk.bold('Type'), chalk.bold('Version')]]
        for (const version of versions) {
          rows.push([databaseType, version])
        }
        outputTable(rows)
        return
      }

      const rows: string[][] = [[chalk.bold('Type'), chalk.bold('Versions')]]
      for (const [type, versions] of Object.entries(versionsMap)) {
        rows.push([type, summarizeVersions(versions)])
      }
      outputTable(rows)
    }))

  dbCmd
    .command('create <type>')
    .description('Create a database')
    .requiredOption('--name <name>', 'Database name')
    .option('--version <version>', 'Database version')
    .option('--cpu <cpu>', 'CPU cores per replica', '1')
    .option('--memory <memory>', 'Memory in GB per replica', '1')
    .option('--storage <storage>', 'Storage in GB per replica', '3')
    .option('--replicas <replicas>', 'Replica count', '1')
    .option('--termination-policy <policy>', 'Termination policy (delete|wipeout)')
    .option('--backup-start', 'Enable automatic backups')
    .option('--backup-type <type>', 'Automatic backup frequency (day|hour|week)')
    .option('--backup-week <day>', 'Weekday for weekly backups', collectOption, [] as string[])
    .option('--backup-hour <hour>', 'Backup hour (00-23)')
    .option('--backup-minute <minute>', 'Backup minute (00-59)')
    .option('--backup-save-time <count>', 'Retention count')
    .option('--backup-save-type <type>', 'Retention unit (days|hours|weeks|months)')
    .option('--param <KEY=VALUE>', 'Database parameter override', collectOption, [] as string[])
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({
      spinnerText: 'Creating database...'
    }, async (
      ctx,
      type: string,
      options: {
        name: string
        version?: string
        cpu: string
        memory: string
        storage: string
        replicas: string
        terminationPolicy?: string
        backupStart?: boolean
        backupType?: string
        backupWeek: string[]
        backupHour?: string
        backupMinute?: string
        backupSaveTime?: string
        backupSaveType?: string
        param: string[]
        output: string
      }
    ) => {
      const client = createDatabaseClient()
      const quota = {
        cpu: parseNumericValue(options.cpu, 'cpu'),
        memory: parseNumericValue(options.memory, 'memory'),
        storage: parseNumericValue(options.storage, 'storage'),
        replicas: parseIntegerValue(options.replicas, 'replicas')
      }
      const autoBackup = buildAutoBackup(options)
      const parameterConfig = options.param.length > 0 ? parseKeyValueArgs(options.param) : undefined

      const body = {
        name: options.name,
        type: normalizeDatabaseType(type),
        quota
      }

      if (options.version) Object.assign(body, { version: options.version })
      if (options.terminationPolicy) Object.assign(body, { terminationPolicy: options.terminationPolicy })
      if (autoBackup) Object.assign(body, { autoBackup })
      if (parameterConfig) Object.assign(body, { parameterConfig })

      const { data, error, response } = await client.POST('/databases', {
        headers: ctx.auth,
        body: body as any
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson(data)
        return
      }

      ctx.spinner.succeed(`Database "${data.name}" created successfully`)
      console.log(chalk.dim(`  Provisioning status: ${data.status}`))
      console.log(chalk.dim(`  Next: sealos-cli database get ${data.name}`))
    }))

  dbCmd
    .command('get <name>')
    .alias('describe')
    .description('Get database details')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Loading database...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDatabaseClient()
      const { data, error, response } = await client.GET('/databases/{databaseName}', {
        headers: ctx.auth,
        params: {
          path: { databaseName: name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      const connection = await resolveDatabaseConnection(data, ctx.auth)
      const database = connection
        ? {
            ...data,
            connection
          }
        : data

      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(database)
        return
      }

      printDatabaseDetail(database)
    }))

  dbCmd
    .command('connection <name>')
    .description('Show database connection details')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Loading connection details...' }, async (ctx, name: string, options: { output: string }) => {
      const connection = await loadDatabaseConnectionDetails(name, ctx.auth)

      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(connection)
        return
      }

      printConnectionDetail(connection)
    }))

  dbCmd
    .command('update <name>')
    .description('Update database resources')
    .option('--cpu <cpu>', 'CPU cores per replica')
    .option('--memory <memory>', 'Memory in GB per replica')
    .option('--storage <storage>', 'Storage in GB per replica')
    .option('--replicas <replicas>', 'Replica count')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({
      spinnerText: 'Updating database...'
    }, async (
      ctx,
      name: string,
      options: { cpu?: string; memory?: string; storage?: string; replicas?: string; output: string }
    ) => {
      const quota = buildQuota(options)
      if (Object.keys(quota).length === 0) {
        throw new Error('Provide at least one of --cpu, --memory, --storage, or --replicas.')
      }

      const client = createDatabaseClient()
      const { error, response } = await client.PATCH('/databases/{databaseName}', {
        headers: ctx.auth,
        params: {
          path: { databaseName: name }
        },
        body: { quota }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'update',
          resource: 'database',
          name,
          status: 'requested'
        })
        return
      }
      ctx.spinner.succeed(`Database "${name}" update requested`)
    }))

  dbCmd
    .command('start <name>')
    .description('Start a database')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Starting database...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDatabaseClient()
      const { error, response } = await client.POST('/databases/{databaseName}/start', {
        headers: ctx.auth,
        params: {
          path: { databaseName: name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'start',
          resource: 'database',
          name,
          status: 'requested'
        })
        return
      }
      ctx.spinner.succeed(`Database "${name}" start requested`)
    }))

  dbCmd
    .command('pause <name>')
    .alias('stop')
    .description('Pause a database')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Pausing database...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDatabaseClient()
      const { error, response } = await client.POST('/databases/{databaseName}/pause', {
        headers: ctx.auth,
        params: {
          path: { databaseName: name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'pause',
          resource: 'database',
          name,
          status: 'requested'
        })
        return
      }
      ctx.spinner.succeed(`Database "${name}" pause requested`)
    }))

  dbCmd
    .command('restart <name>')
    .description('Restart a database')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Restarting database...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDatabaseClient()
      const { error, response } = await client.POST('/databases/{databaseName}/restart', {
        headers: ctx.auth,
        params: {
          path: { databaseName: name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'restart',
          resource: 'database',
          name,
          status: 'requested'
        })
        return
      }
      ctx.spinner.succeed(`Database "${name}" restart requested`)
    }))

  dbCmd
    .command('delete <name>')
    .description('Delete a database')
    .option('-f, --force', 'Delete without confirmation')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Deleting database...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDatabaseClient()
      const { error, response } = await client.DELETE('/databases/{databaseName}', {
        headers: ctx.auth,
        params: {
          path: { databaseName: name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'delete',
          resource: 'database',
          name,
          status: 'requested'
        })
        return
      }
      ctx.spinner.succeed(`Database "${name}" delete requested`)
    }))

  dbCmd
    .command('backups <name>')
    .description('List backups for a database')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Loading backups...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDatabaseClient()
      const { data, error, response } = await client.GET('/databases/{databaseName}/backups', {
        headers: ctx.auth,
        params: {
          path: { databaseName: name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }

      if (data.length === 0) {
        console.log('No backups found.')
        return
      }

      const rows: string[][] = [[
        chalk.bold('Name'),
        chalk.bold('Status'),
        chalk.bold('Created'),
        chalk.bold('Description')
      ]]

      for (const backup of data) {
        rows.push([
          formatValue(backup.name),
          formatValue(backup.status),
          formatValue(backup.createdAt),
          formatValue(backup.description)
        ])
      }

      outputTable(rows)
    }))

  dbCmd
    .command('backup <name>')
    .description('Create a database backup')
    .option('--name <backupName>', 'Backup name')
    .option('--description <description>', 'Backup description')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({
      spinnerText: 'Creating backup...'
    }, async (
      ctx,
      name: string,
      options: { name?: string; description?: string; output: string }
    ) => {
      const client = createDatabaseClient()
      const body: Record<string, string> = {}
      if (options.name) body.name = options.name
      if (options.description) body.description = options.description

      const { error, response } = await client.POST('/databases/{databaseName}/backups', {
        headers: ctx.auth,
        params: {
          path: { databaseName: name }
        },
        body
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'backup',
          resource: 'database',
          name,
          backupName: options.name ?? null,
          status: 'requested'
        })
        return
      }
      ctx.spinner.succeed(`Backup requested for database "${name}"`)
    }))

  dbCmd
    .command('backup-delete <databaseName> <backupName>')
    .description('Delete a database backup')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({
      spinnerText: 'Deleting backup...'
    }, async (ctx, databaseName: string, backupName: string, options: { output: string }) => {
      const client = createDatabaseClient()
      const { error, response } = await client.DELETE('/databases/{databaseName}/backups/{backupName}', {
        headers: ctx.auth,
        params: {
          path: { databaseName, backupName }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'backup-delete',
          resource: 'database-backup',
          databaseName,
          backupName,
          status: 'deleted'
        })
        return
      }
      ctx.spinner.succeed(`Backup "${backupName}" deleted`)
    }))

  dbCmd
    .command('restore <databaseName>')
    .description('Restore a database from a backup')
    .requiredOption('--from <backupName>', 'Backup name to restore from')
    .option('--name <name>', 'Name for the restored database')
    .option('--replicas <replicas>', 'Replica count for the restored database')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({
      spinnerText: 'Restoring database...'
    }, async (
      ctx,
      databaseName: string,
      options: { from: string; name?: string; replicas?: string; output: string }
    ) => {
      const client = createDatabaseClient()
      const body: Record<string, unknown> = {}
      if (options.name) body.name = options.name
      if (options.replicas) body.replicas = parseIntegerValue(options.replicas, 'replicas')

      const { error, response } = await client.POST('/databases/{databaseName}/backups/{backupName}/restore', {
        headers: ctx.auth,
        params: {
          path: { databaseName, backupName: options.from }
        },
        body
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'restore',
          resource: 'database',
          databaseName,
          backupName: options.from,
          restoredName: options.name ?? null,
          status: 'requested'
        })
        return
      }
      ctx.spinner.succeed(`Restore requested from backup "${options.from}"`)
    }))

  dbCmd
    .command('enable-public <name>')
    .alias('expose')
    .description('Enable public access for a database')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Enabling public access...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDatabaseClient()
      const { error, response } = await client.POST('/databases/{databaseName}/enable-public', {
        headers: ctx.auth,
        params: {
          path: { databaseName: name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      const connection = await loadDatabaseConnectionDetails(name, ctx.auth)

      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson(buildPublicAccessResult('enable-public', name, connection))
        return
      }
      ctx.spinner.succeed(`Public access enabled for "${name}"`)
      printConnectionDetail(connection)
    }))

  dbCmd
    .command('disable-public <name>')
    .alias('unexpose')
    .description('Disable public access for a database')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Disabling public access...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createDatabaseClient()
      const { error, response } = await client.POST('/databases/{databaseName}/disable-public', {
        headers: ctx.auth,
        params: {
          path: { databaseName: name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)
      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson(buildPublicAccessResult('disable-public', name))
        return
      }
      ctx.spinner.succeed(`Public access disabled for "${name}"`)
    }))

  dbCmd
    .command('logs <podName>')
    .description('Get parsed database logs for a pod')
    .requiredOption('--db-type <type>', 'Database type used by the log service')
    .requiredOption('--log-type <type>', 'Log type used by the log service')
    .requiredOption('--log-path <path>', 'Log path to read. Use "log-files" first to discover valid paths')
    .option('--page <page>', 'Page number', '1')
    .option('--page-size <pageSize>', 'Page size', '200')
    .option('-o, --output <format>', 'Output format (json|table|plain)', 'json')
    .action(withAuth({
      spinnerText: 'Loading logs...'
    }, async (
      ctx,
      podName: string,
      options: {
        dbType: string
        logType: string
        logPath: string
        page: string
        pageSize: string
        output: string
      }
    ) => {
      const client = createDatabaseClient()
      const { data, error, response } = await client.GET('/logs', {
        headers: ctx.auth,
        params: {
          query: {
            podName,
            dbType: normalizeLogDbType(options.dbType),
            logType: normalizeLogType(options.logType),
            logPath: options.logPath,
            page: parseIntegerValue(options.page, 'page'),
            pageSize: parseIntegerValue(options.pageSize, 'page-size')
          }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }

      if (options.output === 'table') {
        const rows: string[][] = [[chalk.bold('Timestamp'), chalk.bold('Level'), chalk.bold('Content')]]
        for (const log of data.data.logs) {
          rows.push([formatValue(log.timestamp), formatValue(log.level), formatValue(log.content)])
        }
        outputTable(rows)
        return
      }

      for (const log of data.data.logs) {
        console.log(`${log.timestamp} [${log.level}] ${log.content}`)
      }
      console.log(chalk.dim(`\npage=${data.data.metadata.page} total=${data.data.metadata.total} hasMore=${String(data.data.metadata.hasMore)}`))
    }))

  dbCmd
    .command('log-files <podName>')
    .description('List database log files for a pod')
    .requiredOption('--db-type <type>', 'Database type used by the log service')
    .requiredOption('--log-type <type>', 'Log type used by the log service')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({
      spinnerText: 'Loading log files...'
    }, async (
      ctx,
      podName: string,
      options: { dbType: string; logType: string; output: string }
    ) => {
      const client = createDatabaseClient()
      const { data, error, response } = await client.GET('/logs/files', {
        headers: ctx.auth,
        params: {
          query: {
            podName,
            dbType: normalizeLogDbType(options.dbType),
            logType: normalizeLogType(options.logType)
          }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }

      if (data.data.length === 0) {
        console.log('No log files found.')
        return
      }

      const rows: string[][] = [[
        chalk.bold('Name'),
        chalk.bold('Path'),
        chalk.bold('Kind'),
        chalk.bold('Size'),
        chalk.bold('Updated'),
        chalk.bold('Processed')
      ]]

      for (const file of data.data) {
        rows.push([
          formatValue(file.name),
          formatValue(file.path),
          formatValue(file.kind),
          formatValue(file.size),
          formatValue(file.updateTime),
          formatValue(file.processed)
        ])
      }

      outputTable(rows)
    }))

  dbCmd
    .command('* [args...]', { hidden: true })
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .allowUnknownOption()
    .action(async (args: string[], options: { output: string }) => {
      const [name, operation, ...rest] = args
      const aliases: Record<string, string> = {
        connection: 'connection',
        connect: 'connection',
        'enable-public': 'enable-public',
        expose: 'expose',
        'disable-public': 'disable-public',
        unexpose: 'unexpose'
      }
      const command = operation ? aliases[operation] : undefined
      if (!name || !command) {
        throw new Error('Unknown database command. Use "sealos-cli database --help" to list supported commands.')
      }

      await dbCmd.parseAsync([command, name, ...rest, '--output', options.output], { from: 'user' })
    })

  return dbCmd
}
