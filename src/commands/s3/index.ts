import { Command } from 'commander'
import chalk from 'chalk'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import fetch from 'node-fetch'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { CustomObjectsApi, KubeConfig } from '@kubernetes/client-node'
import { getKubeconfigContent } from '../../lib/auth.ts'
import { ConfigError, type ApiErrorBody, mapApiError } from '../../lib/errors.ts'
import { outputJson, outputTable } from '../../lib/output.ts'
import { withAuth } from '../../lib/with-auth.ts'

const OBJECT_STORAGE_GROUP = 'objectstorage.sealos.io'
const OBJECT_STORAGE_VERSION = 'v1'
const BUCKET_PLURAL = 'objectstoragebuckets'
const USER_PLURAL = 'objectstorageusers'
const S3_REGION = 'us-east-1'
const PUBLIC_POLICIES = ['private', 'publicRead', 'publicReadwrite'] as const

type BucketPolicy = typeof PUBLIC_POLICIES[number]

interface BucketCreateOptions {
  policy: BucketPolicy
  output: string
}

interface BucketListOptions {
  output: string
}

interface BucketUpdateOptions {
  policy: BucketPolicy
  output: string
}

interface ObjectListOptions {
  prefix?: string
  delimiter?: string
  maxKeys?: string
  token?: string
  output: string
}

interface ObjectUploadOptions {
  key?: string
  contentType?: string
  output: string
}

interface ObjectDownloadOptions {
  output: string
}

interface ObjectDeleteOptions {
  output: string
}

interface PresignOptions {
  expires: string
  method: 'get' | 'put'
  output: string
}

interface SecretOptions {
  output: string
}

interface BucketMetadata {
  name: string
  namespace: string
  creationTimestamp?: string
  uid?: string
}

interface BucketCR {
  apiVersion: 'objectstorage.sealos.io/v1'
  kind: 'ObjectStorageBucket'
  metadata: BucketMetadata
  spec: {
    policy: BucketPolicy
  }
  status?: {
    name?: string
  }
}

interface UserCR {
  apiVersion: 'objectstorage.sealos.io/v1'
  kind: 'ObjectStorageUser'
  metadata: {
    name: string
    namespace: string
  }
  spec: {
    secretKeyVersion: number
  }
  status?: {
    quota?: number
    size?: number
    objectsCount?: number
    accessKey?: string
    external?: string
    internal?: string
    secretKey?: string
    secretKeyVersion?: number
  }
}

interface UserSecret {
  CONSOLE_ACCESS_KEY: string
  CONSOLE_SECRET_KEY: string
  internal: string
  external: string
  specVersion: number
  version: number
}

interface ObjectStorageContext {
  api: CustomObjectsApi
  kc: KubeConfig
  namespace: string
  userName: string
}

interface S3ClientOptions {
  endpoint?: string
  accessKey?: string
  secretKey?: string
}

function formatValue (value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

export function normalizeBucketPolicy (value: string): BucketPolicy {
  const aliases: Record<string, BucketPolicy> = {
    private: 'private',
    readonly: 'publicRead',
    read: 'publicRead',
    'public-read': 'publicRead',
    publicread: 'publicRead',
    publicRead: 'publicRead',
    readwrite: 'publicReadwrite',
    'read-write': 'publicReadwrite',
    'public-readwrite': 'publicReadwrite',
    'public-read-write': 'publicReadwrite',
    publicreadwrite: 'publicReadwrite',
    publicReadwrite: 'publicReadwrite'
  }
  const resolved = aliases[value.trim()]
  if (!resolved) {
    throw new Error(`Unsupported bucket policy "${value}". Use one of: ${PUBLIC_POLICIES.join(', ')}`)
  }
  return resolved
}

export function parsePositiveInteger (value: string, field: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${field} must be a positive integer`)
  }
  return parsed
}

function decodeProviderAuthHeader (headers: { Authorization: string }): string {
  try {
    return decodeURIComponent(headers.Authorization)
  } catch {
    throw new ConfigError('Invalid Authorization header. Run "sealos-cli login" again.')
  }
}

function loadKubeConfigFromAuth (headers: { Authorization: string }): KubeConfig {
  const kubeconfig = getKubeconfigContent() || decodeProviderAuthHeader(headers)
  const kc = new KubeConfig()
  kc.loadFromString(kubeconfig)
  return kc
}

function resolveNamespace (kc: KubeConfig): string {
  const currentContext = kc.getContextObject(kc.getCurrentContext())
  const namespace = currentContext?.namespace
  if (!namespace) {
    throw new ConfigError('Current kubeconfig context has no namespace. Run "sealos-cli login" or "sealos-cli workspace switch" first.')
  }
  return namespace
}

function getObjectStorageContext (headers: { Authorization: string }): ObjectStorageContext {
  const kc = loadKubeConfigFromAuth(headers)
  const namespace = resolveNamespace(kc)
  const userName = namespace.replace(/^ns-/, '')

  return {
    api: kc.makeApiClient(CustomObjectsApi),
    kc,
    namespace,
    userName
  }
}

export function generateBucketCR (data: { name: string; policy: BucketPolicy; namespace: string }): BucketCR {
  return {
    apiVersion: 'objectstorage.sealos.io/v1',
    kind: 'ObjectStorageBucket',
    metadata: {
      name: data.name,
      namespace: data.namespace
    },
    spec: {
      policy: data.policy
    }
  }
}

export function generateUserCR (data: { name: string; namespace: string; version?: number }): UserCR {
  return {
    apiVersion: 'objectstorage.sealos.io/v1',
    kind: 'ObjectStorageUser',
    metadata: {
      name: data.name,
      namespace: data.namespace
    },
    spec: {
      secretKeyVersion: data.version ?? 0
    }
  }
}

async function patchNamespacedCustomObjectMerge<T> (
  ctx: ObjectStorageContext,
  options: {
    plural: string
    name: string
    body: unknown
  }
): Promise<T> {
  const cluster = ctx.kc.getCurrentCluster()
  if (!cluster?.server) {
    throw new ConfigError('Current kubeconfig context has no cluster server. Run "sealos-cli login" again.')
  }

  const path = [
    'apis',
    OBJECT_STORAGE_GROUP,
    OBJECT_STORAGE_VERSION,
    'namespaces',
    ctx.namespace,
    options.plural,
    options.name
  ].map(encodeURIComponent).join('/')
  const url = `${cluster.server.replace(/\/+$/, '')}/${path}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/merge-patch+json'
  }
  const requestOptions: any = {
    method: 'PATCH',
    headers
  }
  const fetchOptions = await ctx.kc.applyToFetchOptions(requestOptions)

  const response = await fetch(url, {
    ...fetchOptions,
    body: JSON.stringify(options.body)
  })
  const text = await response.text()
  if (!response.ok) {
    const error = new Error(text || response.statusText || `Kubernetes request failed with status ${response.status}`)
    Object.assign(error, {
      code: response.status,
      body: parseK8sErrorBody(text)
    })
    throw error
  }

  return text ? JSON.parse(text) as T : undefined as T
}

function normalizeBucketName (name: string, namespace: string): string {
  const namespacePrefix = `${namespace.replace(/^ns-/, '')}-`
  return name.startsWith(namespacePrefix) ? name.slice(namespacePrefix.length) : name
}

function formatBucketName (crName: string, namespace: string): string {
  return `${namespace.replace(/^ns-/, '')}-${crName}`
}

export function formatBucket (bucket: BucketCR, namespace: string) {
  return {
    name: formatBucketName(bucket.metadata.name, namespace),
    crName: bucket.metadata.name,
    policy: bucket.spec.policy,
    isComplete: !!bucket.status,
    createdAt: bucket.metadata.creationTimestamp ?? null,
    uid: bucket.metadata.uid ?? null
  }
}

function mapK8sApiError (error: unknown): Error {
  if (error && typeof error === 'object') {
    const maybe = error as {
      code?: number
      body?: {
        message?: string
        reason?: string
        details?: unknown
      }
      message?: string
    }
    if (typeof maybe.code === 'number') {
      return mapApiError(maybe.code, {
        error: {
          message: maybe.body?.message || maybe.message || `Kubernetes request failed with status ${maybe.code}`,
          code: maybe.body?.reason,
          details: maybe.body?.details as NonNullable<ApiErrorBody['error']>['details']
        }
      })
    }
  }

  return error instanceof Error ? error : new Error(String(error))
}

function parseK8sErrorBody (text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return {
      message: text
    }
  }
}

function isK8sStatusCode (error: unknown, code: number): boolean {
  return !!(error && typeof error === 'object' && (error as { code?: number }).code === code)
}

async function listBucketCRs (ctx: ObjectStorageContext): Promise<BucketCR[]> {
  try {
    const result = await ctx.api.listNamespacedCustomObject({
      group: OBJECT_STORAGE_GROUP,
      version: OBJECT_STORAGE_VERSION,
      namespace: ctx.namespace,
      plural: BUCKET_PLURAL
    }) as { items?: BucketCR[] }

    return result.items ?? []
  } catch (error) {
    throw mapK8sApiError(error)
  }
}

async function getBucketCR (ctx: ObjectStorageContext, name: string): Promise<BucketCR> {
  try {
    return await ctx.api.getNamespacedCustomObject({
      group: OBJECT_STORAGE_GROUP,
      version: OBJECT_STORAGE_VERSION,
      namespace: ctx.namespace,
      plural: BUCKET_PLURAL,
      name: normalizeBucketName(name, ctx.namespace)
    }) as BucketCR
  } catch (error) {
    throw mapK8sApiError(error)
  }
}

async function applyBucketCR (ctx: ObjectStorageContext, name: string, policy: BucketPolicy): Promise<BucketCR> {
  const crName = normalizeBucketName(name, ctx.namespace)

  try {
    await ctx.api.getNamespacedCustomObject({
      group: OBJECT_STORAGE_GROUP,
      version: OBJECT_STORAGE_VERSION,
      namespace: ctx.namespace,
      plural: BUCKET_PLURAL,
      name: crName
    })
    return await updateBucketPolicy(ctx, crName, policy)
  } catch (error) {
    if (!isK8sStatusCode(error, 404)) {
      throw mapK8sApiError(error)
    }
  }

  try {
    return await ctx.api.createNamespacedCustomObject({
      group: OBJECT_STORAGE_GROUP,
      version: OBJECT_STORAGE_VERSION,
      namespace: ctx.namespace,
      plural: BUCKET_PLURAL,
      body: generateBucketCR({ name: crName, policy, namespace: ctx.namespace })
    }) as BucketCR
  } catch (error) {
    throw mapK8sApiError(error)
  }
}

async function updateBucketPolicy (ctx: ObjectStorageContext, name: string, policy: BucketPolicy): Promise<BucketCR> {
  try {
    return await patchNamespacedCustomObjectMerge<BucketCR>(ctx, {
      plural: BUCKET_PLURAL,
      name: normalizeBucketName(name, ctx.namespace),
      body: {
        spec: {
          policy
        }
      }
    })
  } catch (error) {
    throw mapK8sApiError(error)
  }
}

async function deleteBucketCR (ctx: ObjectStorageContext, name: string): Promise<void> {
  try {
    await ctx.api.deleteNamespacedCustomObject({
      group: OBJECT_STORAGE_GROUP,
      version: OBJECT_STORAGE_VERSION,
      namespace: ctx.namespace,
      plural: BUCKET_PLURAL,
      name: normalizeBucketName(name, ctx.namespace)
    })
  } catch (error) {
    throw mapK8sApiError(error)
  }
}

function secretFromUserCR (user: UserCR): UserSecret | null {
  if (!user.status?.accessKey || !user.status.secretKey || !user.status.internal || !user.status.external) {
    return null
  }

  return {
    CONSOLE_ACCESS_KEY: user.status.accessKey,
    CONSOLE_SECRET_KEY: user.status.secretKey,
    internal: user.status.internal,
    external: user.status.external,
    specVersion: user.spec.secretKeyVersion ?? 0,
    version: user.status.secretKeyVersion ?? 0
  }
}

async function readUserSecret (ctx: ObjectStorageContext): Promise<UserSecret | null> {
  const user = await ctx.api.getNamespacedCustomObjectStatus({
    group: OBJECT_STORAGE_GROUP,
    version: OBJECT_STORAGE_VERSION,
    namespace: ctx.namespace,
    plural: USER_PLURAL,
    name: ctx.userName
  }) as UserCR

  return secretFromUserCR(user)
}

async function initUserSecret (ctx: ObjectStorageContext, retries = 3): Promise<UserSecret> {
  try {
    const secret = await readUserSecret(ctx)
    if (secret) return secret
  } catch (error) {
    if (!isK8sStatusCode(error, 404)) {
      throw mapK8sApiError(error)
    }

    try {
      await ctx.api.createNamespacedCustomObject({
        group: OBJECT_STORAGE_GROUP,
        version: OBJECT_STORAGE_VERSION,
        namespace: ctx.namespace,
        plural: USER_PLURAL,
        body: generateUserCR({ name: ctx.userName, namespace: ctx.namespace })
      })
    } catch (createError) {
      if (!isK8sStatusCode(createError, 409)) {
        throw mapK8sApiError(createError)
      }
    }
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    try {
      const secret = await readUserSecret(ctx)
      if (secret) return secret
    } catch (error) {
      if (!isK8sStatusCode(error, 404)) {
        throw mapK8sApiError(error)
      }
    }
  }

  throw new Error('Object storage user secret is not ready yet. Please retry in a few seconds.')
}

async function updateUserSecret (ctx: ObjectStorageContext): Promise<UserCR> {
  const user = await ctx.api.getNamespacedCustomObjectStatus({
    group: OBJECT_STORAGE_GROUP,
    version: OBJECT_STORAGE_VERSION,
    namespace: ctx.namespace,
    plural: USER_PLURAL,
    name: ctx.userName
  }) as UserCR
  const specVersion = user.spec?.secretKeyVersion ?? 0
  const statusVersion = user.status?.secretKeyVersion ?? 0

  if (specVersion > statusVersion) {
    throw new Error('Secret key is already updating. Please retry after the current rotation finishes.')
  }

  try {
    return await patchNamespacedCustomObjectMerge<UserCR>(ctx, {
      plural: USER_PLURAL,
      name: ctx.userName,
      body: generateUserCR({
        name: ctx.userName,
        namespace: ctx.namespace,
        version: Date.now()
      })
    })
  } catch (error) {
    throw mapK8sApiError(error)
  }
}

async function getQuota (ctx: ObjectStorageContext) {
  try {
    const user = await ctx.api.getNamespacedCustomObject({
      group: OBJECT_STORAGE_GROUP,
      version: OBJECT_STORAGE_VERSION,
      namespace: ctx.namespace,
      plural: USER_PLURAL,
      name: ctx.userName
    }) as UserCR

    return {
      total: user.status?.quota ?? null,
      used: user.status?.size ?? null,
      count: user.status?.objectsCount ?? null
    }
  } catch (error) {
    throw mapK8sApiError(error)
  }
}

function createObjectClient (secret: UserSecret, options: S3ClientOptions = {}): S3Client {
  const endpoint = options.endpoint || secret.external
  const accessKeyId = options.accessKey || secret.CONSOLE_ACCESS_KEY
  const secretAccessKey = options.secretKey || secret.CONSOLE_SECRET_KEY

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 credentials are not ready yet. Run "sealos-cli s3 secret" first and retry when the user is complete.')
  }

  return new S3Client({
    endpoint: endpoint.startsWith('http://') || endpoint.startsWith('https://') ? endpoint : `https://${endpoint}`,
    forcePathStyle: true,
    region: S3_REGION,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  })
}

async function createS3ClientFromAuth (headers: { Authorization: string }, options: S3ClientOptions = {}): Promise<S3Client> {
  if (options.accessKey || options.secretKey || options.endpoint) {
    if (!options.accessKey || !options.secretKey || !options.endpoint) {
      throw new Error('Provide --endpoint, --access-key, and --secret-key together, or omit all three to use Sealos object storage credentials.')
    }

    return createObjectClient({
      CONSOLE_ACCESS_KEY: options.accessKey,
      CONSOLE_SECRET_KEY: options.secretKey,
      internal: options.endpoint,
      external: options.endpoint,
      specVersion: 0,
      version: 0
    })
  }

  const ctx = getObjectStorageContext(headers)
  return createObjectClient(await initUserSecret(ctx))
}

function formatObjectList (data: {
  Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date; ETag?: string; StorageClass?: string }>
  CommonPrefixes?: Array<{ Prefix?: string }>
  IsTruncated?: boolean
  NextContinuationToken?: string
}) {
  return {
    prefixes: (data.CommonPrefixes ?? []).map(item => item.Prefix).filter(Boolean),
    objects: (data.Contents ?? []).map(item => ({
      key: item.Key,
      size: item.Size ?? 0,
      lastModified: item.LastModified?.toISOString() ?? null,
      eTag: item.ETag ?? null,
      storageClass: item.StorageClass ?? null
    })),
    isTruncated: data.IsTruncated ?? false,
    nextContinuationToken: data.NextContinuationToken ?? null
  }
}

function printBuckets (buckets: ReturnType<typeof formatBucket>[]): void {
  if (buckets.length === 0) {
    console.log('No buckets found.')
    return
  }

  outputTable([
    [chalk.bold('Name'), chalk.bold('CR Name'), chalk.bold('Policy'), chalk.bold('Ready'), chalk.bold('Created')],
    ...buckets.map(bucket => [
      formatValue(bucket.name),
      formatValue(bucket.crName),
      formatValue(bucket.policy),
      formatValue(bucket.isComplete),
      formatValue(bucket.createdAt)
    ])
  ])
}

function printObjectList (data: ReturnType<typeof formatObjectList>): void {
  const rows: string[][] = [[chalk.bold('Type'), chalk.bold('Key'), chalk.bold('Size'), chalk.bold('Last Modified')]]

  for (const prefix of data.prefixes) {
    rows.push(['prefix', prefix!, '-', '-'])
  }
  for (const object of data.objects) {
    rows.push([
      'object',
      formatValue(object.key),
      formatValue(object.size),
      formatValue(object.lastModified)
    ])
  }

  if (rows.length === 1) {
    console.log('No objects found.')
    return
  }

  outputTable(rows)
  if (data.nextContinuationToken) {
    console.log(chalk.dim(`Next token: ${data.nextContinuationToken}`))
  }
}

function printSecret (secret: UserSecret): void {
  outputTable([
    [chalk.bold('Field'), chalk.bold('Value')],
    ['Access Key', secret.CONSOLE_ACCESS_KEY],
    ['Secret Key', secret.CONSOLE_SECRET_KEY],
    ['External Endpoint', secret.external],
    ['Internal Endpoint', secret.internal],
    ['Version', String(secret.version)],
    ['Spec Version', String(secret.specVersion)]
  ])
}

function printQuota (quota: Awaited<ReturnType<typeof getQuota>>): void {
  outputTable([
    [chalk.bold('Field'), chalk.bold('Value')],
    ['Total', formatValue(quota.total)],
    ['Used', formatValue(quota.used)],
    ['Objects', formatValue(quota.count)]
  ])
}

export function createS3Command (): Command {
  const s3Cmd = new Command('s3')
    .description('Manage Sealos object storage buckets and S3 objects')

  const withS3ClientOptions = <T extends Command>(command: T): T => {
    command
      .option('--endpoint <url>', 'S3 endpoint override')
      .option('--access-key <key>', 'S3 access key override')
      .option('--secret-key <key>', 'S3 secret key override')
    return command
  }

  s3Cmd
    .command('buckets')
    .alias('list-buckets')
    .description('List object storage buckets')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Loading buckets...' }, async (ctx, options: BucketListOptions) => {
      const os = getObjectStorageContext(ctx.auth)
      const buckets = (await listBucketCRs(os)).map(bucket => formatBucket(bucket, os.namespace))
      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson({ list: buckets })
        return
      }
      printBuckets(buckets)
    }))

  s3Cmd
    .command('create-bucket <name>')
    .description('Create an object storage bucket')
    .option('--policy <policy>', 'Bucket policy (private|publicRead|publicReadwrite)', 'private')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Creating bucket...' }, async (ctx, name: string, options: BucketCreateOptions) => {
      const os = getObjectStorageContext(ctx.auth)
      const bucket = formatBucket(await applyBucketCR(os, name, normalizeBucketPolicy(options.policy)), os.namespace)

      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson(bucket)
        return
      }

      ctx.spinner.succeed(`Bucket "${bucket.name}" created`)
      printBuckets([bucket])
    }))

  s3Cmd
    .command('get-bucket <name>')
    .description('Get object storage bucket details')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Loading bucket...' }, async (ctx, name: string, options: BucketListOptions) => {
      const os = getObjectStorageContext(ctx.auth)
      const bucket = formatBucket(await getBucketCR(os, name), os.namespace)
      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(bucket)
        return
      }
      printBuckets([bucket])
    }))

  s3Cmd
    .command('update-bucket <name>')
    .description('Update an object storage bucket policy')
    .requiredOption('--policy <policy>', 'Bucket policy (private|publicRead|publicReadwrite)')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Updating bucket...' }, async (ctx, name: string, options: BucketUpdateOptions) => {
      const os = getObjectStorageContext(ctx.auth)
      const bucket = formatBucket(await updateBucketPolicy(os, name, normalizeBucketPolicy(options.policy)), os.namespace)

      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson(bucket)
        return
      }

      ctx.spinner.succeed(`Bucket "${bucket.name}" updated`)
      printBuckets([bucket])
    }))

  s3Cmd
    .command('delete-bucket <name>')
    .alias('rm-bucket')
    .description('Delete an object storage bucket')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Deleting bucket...' }, async (ctx, name: string, options: BucketListOptions) => {
      const os = getObjectStorageContext(ctx.auth)
      await deleteBucketCR(os, name)

      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'delete-bucket',
          resource: 's3-bucket',
          name: formatBucketName(normalizeBucketName(name, os.namespace), os.namespace),
          status: 'deleted'
        })
        return
      }

      ctx.spinner.succeed(`Bucket "${name}" deleted`)
    }))

  s3Cmd
    .command('secret')
    .description('Show or initialize S3 access credentials')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Loading S3 credentials...' }, async (ctx, options: SecretOptions) => {
      const os = getObjectStorageContext(ctx.auth)
      const secret = await initUserSecret(os)
      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson({ secret })
        return
      }
      printSecret(secret)
    }))

  s3Cmd
    .command('rotate-secret')
    .description('Rotate S3 access credentials')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Rotating S3 credentials...' }, async (ctx, options: SecretOptions) => {
      const os = getObjectStorageContext(ctx.auth)
      const user = await updateUserSecret(os)

      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'rotate-secret',
          resource: 's3-user',
          name: os.userName,
          specVersion: user.spec.secretKeyVersion,
          status: 'updating'
        })
        return
      }

      ctx.spinner.succeed(`S3 credentials are rotating for "${os.userName}"`)
    }))

  s3Cmd
    .command('quota')
    .description('Show object storage quota and usage')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Loading quota...' }, async (ctx, options: SecretOptions) => {
      const os = getObjectStorageContext(ctx.auth)
      const quota = await getQuota(os)
      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson({ quota })
        return
      }
      printQuota(quota)
    }))

  withS3ClientOptions(
    s3Cmd
      .command('list <bucket>')
      .description('List S3 objects in a bucket')
      .option('--prefix <prefix>', 'Object key prefix')
      .option('--delimiter <delimiter>', 'Key delimiter', '/')
      .option('--max-keys <count>', 'Maximum number of keys to return')
      .option('--token <token>', 'Continuation token')
      .option('-o, --output <format>', 'Output format (json|table)', 'json')
  ).action(withAuth({ spinnerText: 'Listing objects...' }, async (ctx, bucket: string, options: ObjectListOptions & S3ClientOptions) => {
    const client = await createS3ClientFromAuth(ctx.auth, options)
    const data = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: options.prefix,
      Delimiter: options.delimiter,
      MaxKeys: options.maxKeys ? parsePositiveInteger(options.maxKeys, 'max-keys') : undefined,
      ContinuationToken: options.token
    }))
    const result = formatObjectList(data)
    ctx.spinner.stop()

    if (options.output === 'json') {
      outputJson(result)
      return
    }
    printObjectList(result)
  }))

  withS3ClientOptions(
    s3Cmd
      .command('upload <bucket> <file>')
      .description('Upload a local file to a bucket')
      .option('--key <key>', 'Destination object key')
      .option('--content-type <type>', 'Object content type')
      .option('-o, --output <format>', 'Output format (json|table)', 'json')
  ).action(withAuth({ spinnerText: 'Uploading object...' }, async (ctx, bucket: string, file: string, options: ObjectUploadOptions & S3ClientOptions) => {
    const client = await createS3ClientFromAuth(ctx.auth, options)
    const key = options.key || file
    const data = await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(file),
      ContentType: options.contentType
    }))

    if (options.output === 'json') {
      ctx.spinner.stop()
      outputJson({
        bucket,
        key,
        eTag: data.ETag ?? null,
        versionId: data.VersionId ?? null
      })
      return
    }

    ctx.spinner.succeed(`Uploaded "${file}" to s3://${bucket}/${key}`)
  }))

  withS3ClientOptions(
    s3Cmd
      .command('download <bucket> <key> <file>')
      .description('Download an object to a local file')
      .option('-o, --output <format>', 'Output format (json|table)', 'json')
  ).action(withAuth({ spinnerText: 'Downloading object...' }, async (ctx, bucket: string, key: string, file: string, options: ObjectDownloadOptions & S3ClientOptions) => {
    const client = await createS3ClientFromAuth(ctx.auth, options)
    const data = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key
    }))
    if (!data.Body) {
      throw new Error('S3 object response had no body.')
    }

    const outputPath = resolve(file)
    await mkdir(dirname(outputPath), { recursive: true })
    await pipeline(data.Body as NodeJS.ReadableStream, createWriteStream(outputPath))

    if (options.output === 'json') {
      ctx.spinner.stop()
      outputJson({
        bucket,
        key,
        file: outputPath,
        contentLength: data.ContentLength ?? null,
        contentType: data.ContentType ?? null,
        lastModified: data.LastModified?.toISOString() ?? null
      })
      return
    }

    ctx.spinner.succeed(`Downloaded s3://${bucket}/${key} to ${outputPath}`)
  }))

  withS3ClientOptions(
    s3Cmd
      .command('delete <bucket> <key>')
      .alias('rm')
      .description('Delete an S3 object')
      .option('-o, --output <format>', 'Output format (json|table)', 'json')
  ).action(withAuth({ spinnerText: 'Deleting object...' }, async (ctx, bucket: string, key: string, options: ObjectDeleteOptions & S3ClientOptions) => {
    const client = await createS3ClientFromAuth(ctx.auth, options)
    await client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    }))

    if (options.output === 'json') {
      ctx.spinner.stop()
      outputJson({
        success: true,
        action: 'delete',
        resource: 's3-object',
        bucket,
        key,
        status: 'deleted'
      })
      return
    }

    ctx.spinner.succeed(`Deleted s3://${bucket}/${key}`)
  }))

  withS3ClientOptions(
    s3Cmd
      .command('presign <bucket> <key>')
      .description('Create a presigned S3 URL')
      .option('--expires <seconds>', 'URL expiry in seconds', '3600')
      .option('--method <method>', 'Signed operation (get|put)', 'get')
      .option('-o, --output <format>', 'Output format (json|table)', 'json')
  ).action(withAuth({ spinnerText: 'Creating presigned URL...' }, async (ctx, bucket: string, key: string, options: PresignOptions & S3ClientOptions) => {
    const method = options.method.trim().toLowerCase()
    if (method !== 'get' && method !== 'put') {
      throw new Error('method must be one of: get, put')
    }

    const expiresIn = parsePositiveInteger(options.expires, 'expires')
    const client = await createS3ClientFromAuth(ctx.auth, options)
    const command = method === 'get'
      ? new GetObjectCommand({ Bucket: bucket, Key: key })
      : new PutObjectCommand({ Bucket: bucket, Key: key })
    const url = await getSignedUrl(client, command, { expiresIn })

    ctx.spinner.stop()
    if (options.output === 'json') {
      outputJson({
        bucket,
        key,
        method,
        expiresIn,
        url
      })
      return
    }

    console.log(url)
  }))

  return s3Cmd
}
