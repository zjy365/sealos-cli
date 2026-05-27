import { describe, expect, test } from 'vitest'
import {
  createS3Command,
  formatBucket,
  generateBucketCR,
  generateUserCR,
  normalizeBucketPolicy,
  parsePositiveInteger
} from '../src/commands/s3/index.ts'

describe('s3 command', () => {
  test('registers object storage and S3 object subcommands', () => {
    const command = createS3Command()
    expect(command.name()).toBe('s3')
    expect(command.commands.map(subcommand => subcommand.name())).toEqual([
      'buckets',
      'create-bucket',
      'get-bucket',
      'update-bucket',
      'delete-bucket',
      'secret',
      'rotate-secret',
      'quota',
      'list',
      'upload',
      'download',
      'delete',
      'presign'
    ])

    expect(command.commands.find(subcommand => subcommand.name() === 'buckets')?.aliases()).toContain('list-buckets')
    expect(command.commands.find(subcommand => subcommand.name() === 'delete-bucket')?.aliases()).toContain('rm-bucket')
    expect(command.commands.find(subcommand => subcommand.name() === 'delete')?.aliases()).toContain('rm')
  })

  test('defaults every action command to JSON output', () => {
    const command = createS3Command()
    const nonJsonDefaults = command.commands
      .map(subcommand => ({
        name: subcommand.name(),
        defaultValue: subcommand.options.find(option => option.long === '--output')?.defaultValue
      }))
      .filter(({ defaultValue }) => defaultValue !== 'json')

    expect(nonJsonDefaults).toEqual([])
  })

  test('normalizes bucket policy aliases', () => {
    expect(normalizeBucketPolicy('private')).toBe('private')
    expect(normalizeBucketPolicy('readonly')).toBe('publicRead')
    expect(normalizeBucketPolicy('public-read')).toBe('publicRead')
    expect(normalizeBucketPolicy('readwrite')).toBe('publicReadwrite')
    expect(normalizeBucketPolicy('public-read-write')).toBe('publicReadwrite')
    expect(() => normalizeBucketPolicy('public')).toThrow(/Unsupported bucket policy/)
  })

  test('validates positive integer options', () => {
    expect(parsePositiveInteger('100', 'max-keys')).toBe(100)
    expect(() => parsePositiveInteger('0', 'max-keys')).toThrow(/positive integer/)
    expect(() => parsePositiveInteger('1.5', 'expires')).toThrow(/positive integer/)
  })

  test('builds object storage CRs with frontend-compatible shapes', () => {
    expect(generateBucketCR({
      name: 'assets',
      namespace: 'ns-private',
      policy: 'publicRead'
    })).toEqual({
      apiVersion: 'objectstorage.sealos.io/v1',
      kind: 'ObjectStorageBucket',
      metadata: {
        name: 'assets',
        namespace: 'ns-private'
      },
      spec: {
        policy: 'publicRead'
      }
    })

    expect(generateUserCR({
      name: 'private',
      namespace: 'ns-private',
      version: 123
    })).toEqual({
      apiVersion: 'objectstorage.sealos.io/v1',
      kind: 'ObjectStorageUser',
      metadata: {
        name: 'private',
        namespace: 'ns-private'
      },
      spec: {
        secretKeyVersion: 123
      }
    })
  })

  test('formats buckets like the objectstorage frontend API', () => {
    expect(formatBucket({
      apiVersion: 'objectstorage.sealos.io/v1',
      kind: 'ObjectStorageBucket',
      metadata: {
        name: 'assets',
        namespace: 'ns-private',
        uid: 'bucket-uid',
        creationTimestamp: '2026-05-27T00:00:00Z'
      },
      spec: {
        policy: 'private'
      },
      status: {
        name: 'assets'
      }
    }, 'ns-private')).toEqual({
      name: 'private-assets',
      crName: 'assets',
      policy: 'private',
      isComplete: true,
      createdAt: '2026-05-27T00:00:00Z',
      uid: 'bucket-uid'
    })
  })
})
