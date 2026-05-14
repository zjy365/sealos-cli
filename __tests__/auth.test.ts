import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProgram } from '../src/main.ts'
import {
  checkAuth,
  clearAuth,
  getAuthInfo,
  getAuthPaths,
  listWorkspaces,
  loginWithDeviceFlow,
  pollForToken,
  saveAuth,
  saveKubeconfig,
  switchWorkspace
} from '../src/lib/auth.ts'
import type { AuthDependencies } from '../src/lib/auth.ts'

interface MockResponseOptions {
  ok?: boolean
  status?: number
  statusText?: string
  body?: unknown
  text?: string
}

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeDeps (responses: MockResponseOptions[] = []): Required<Pick<AuthDependencies, 'paths' | 'fetch' | 'sleep' | 'openBrowser' | 'now' | 'stderr'>> & { calls: string[], sleeps: number[], opened: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'sealos-auth-test-'))
  tempDirs.push(dir)

  const calls: string[] = []
  const sleeps: number[] = []
  const opened: string[] = []
  const paths = getAuthPaths(join(dir, '.sealos'))
  let nowMs = 0

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push(`${init?.method || 'GET'} ${url}`)
    const next = responses.shift()
    if (!next) {
      throw new Error(`Unexpected fetch call: ${url}`)
    }

    return {
      ok: next.ok ?? true,
      status: next.status ?? 200,
      statusText: next.statusText ?? 'OK',
      json: async () => next.body,
      text: async () => next.text ?? JSON.stringify(next.body ?? {})
    } as Response
  }

  return {
    paths,
    calls,
    sleeps,
    opened,
    fetch: fetchImpl,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      nowMs += ms
    },
    openBrowser: (url: string) => {
      opened.push(url)
    },
    now: () => new Date(nowMs),
    stderr: {
      write: () => true
    } as NodeJS.WriteStream
  }
}

const kubeconfig = 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://kube.example\nusers:\n- user:\n    token: regional-token\n'

describe('auth service', () => {
  test('loginWithDeviceFlow saves auth.json and kubeconfig after OAuth device flow', async () => {
    const deps = makeDeps([
      {
        body: {
          device_code: 'device-code',
          user_code: 'USER-CODE',
          verification_uri: 'https://verify.example',
          verification_uri_complete: 'https://verify.example?code=USER-CODE',
          expires_in: 600,
          interval: 1
        }
      },
      { body: { access_token: 'global-token' } },
      { body: { data: { token: 'regional-token', kubeconfig } } },
      {
        body: {
          data: {
            namespaces: [
              { uid: 'team-1', id: 'team-one', teamName: 'Team One', role: 'owner', nstype: 'team' },
              { uid: 'private-1', id: 'private', teamName: 'Private', role: 'owner', nstype: 'private' }
            ]
          }
        }
      }
    ])

    const result = await loginWithDeviceFlow('https://usw-1.sealos.io/', deps)

    assert.deepEqual(result, {
      kubeconfig_path: deps.paths.kubeconfigPath,
      region: 'https://usw-1.sealos.io',
      workspace: 'private'
    })
    assert.deepEqual(deps.opened, ['https://verify.example?code=USER-CODE'])
    assert.equal(statSync(deps.paths.authPath).mode & 0o777, 0o600)
    assert.equal(statSync(deps.paths.kubeconfigPath).mode & 0o777, 0o600)

    const auth = JSON.parse(readFileSync(deps.paths.authPath, 'utf-8'))
    assert.equal(auth.access_token, 'global-token')
    assert.equal(auth.regional_token, 'regional-token')
    assert.equal(auth.auth_method, 'oauth2_device_grant')
    assert.deepEqual(auth.current_workspace, {
      uid: 'private-1',
      id: 'private',
      teamName: 'Private'
    })
    assert.equal(readFileSync(deps.paths.kubeconfigPath, 'utf-8'), kubeconfig)
  })

  test('pollForToken handles pending responses before success', async () => {
    const deps = makeDeps([
      { ok: false, status: 400, body: { error: 'authorization_pending' } },
      { body: { access_token: 'global-token' } }
    ])

    const result = await pollForToken('https://usw-1.sealos.io', 'device-code', 1, 600, deps)

    assert.deepEqual(result, { access_token: 'global-token' })
    assert.deepEqual(deps.sleeps, [1000, 1000])
  })

  test('pollForToken slows down polling when server asks', async () => {
    const deps = makeDeps([
      { ok: false, status: 400, body: { error: 'slow_down' } },
      { body: { access_token: 'global-token' } }
    ])

    const result = await pollForToken('https://usw-1.sealos.io', 'device-code', 1, 600, deps)

    assert.equal(result.access_token, 'global-token')
    assert.deepEqual(deps.sleeps, [1000, 6000])
  })

  test('pollForToken fails on denied or expired authorization', async () => {
    const denied = makeDeps([{ ok: false, status: 400, body: { error: 'access_denied' } }])
    await assert.rejects(
      pollForToken('https://usw-1.sealos.io', 'device-code', 1, 600, denied),
      /Authorization denied by user/
    )

    const expired = makeDeps([{ ok: false, status: 400, body: { error: 'expired_token' } }])
    await assert.rejects(
      pollForToken('https://usw-1.sealos.io', 'device-code', 1, 600, expired),
      /Device code expired/
    )
  })

  test('checkAuth and getAuthInfo report stored auth state', () => {
    const deps = makeDeps()
    assert.deepEqual(checkAuth(deps), { authenticated: false })

    saveKubeconfig(kubeconfig, deps)
    saveAuth({
      region: 'https://usw-1.sealos.io',
      regional_token: 'regional-token',
      auth_method: 'oauth2_device_grant',
      authenticated_at: '2026-05-13T00:00:00.000Z',
      current_workspace: { uid: 'private-1', id: 'private', teamName: 'Private' }
    }, deps)

    assert.deepEqual(checkAuth(deps), {
      authenticated: true,
      kubeconfig_path: deps.paths.kubeconfigPath,
      region: 'https://usw-1.sealos.io',
      workspace: 'private'
    })
    assert.deepEqual(getAuthInfo(deps), {
      authenticated: true,
      kubeconfig_path: deps.paths.kubeconfigPath,
      region: 'https://usw-1.sealos.io',
      workspace: 'private',
      auth_method: 'oauth2_device_grant',
      authenticated_at: '2026-05-13T00:00:00.000Z',
      current_workspace: { uid: 'private-1', id: 'private', teamName: 'Private' }
    })
  })

  test('listWorkspaces normalizes namespace response', async () => {
    const deps = makeDeps([
      {
        body: {
          data: {
            namespaces: [
              { uid: 'private-1', id: 'private', teamName: 'Private', role: 'owner', nstype: 'private' }
            ]
          }
        }
      }
    ])
    saveAuth({
      region: 'https://usw-1.sealos.io',
      regional_token: 'regional-token',
      current_workspace: { uid: 'private-1', id: 'private', teamName: 'Private' }
    }, deps)

    const result = await listWorkspaces(deps)

    assert.deepEqual(result, {
      current: 'private',
      workspaces: [
        { uid: 'private-1', id: 'private', teamName: 'Private', role: 'owner', nstype: 'private' }
      ]
    })
  })

  test('switchWorkspace matches by team name and refreshes token plus kubeconfig', async () => {
    const deps = makeDeps([
      {
        body: {
          data: {
            namespaces: [
              { uid: 'private-1', id: 'private', teamName: 'Private Space', role: 'owner', nstype: 'private' }
            ]
          }
        }
      },
      { body: { data: { token: 'new-regional-token' } } },
      { body: { data: { kubeconfig: kubeconfig.replace('regional-token', 'new-regional-token') } } }
    ])
    saveAuth({
      region: 'https://usw-1.sealos.io',
      regional_token: 'old-regional-token'
    }, deps)

    const result = await switchWorkspace('private space', deps)

    assert.deepEqual(result, {
      workspace: { uid: 'private-1', id: 'private', teamName: 'Private Space' },
      kubeconfig_path: deps.paths.kubeconfigPath
    })
    const auth = JSON.parse(readFileSync(deps.paths.authPath, 'utf-8'))
    assert.equal(auth.regional_token, 'new-regional-token')
    assert.equal(readFileSync(deps.paths.kubeconfigPath, 'utf-8').includes('new-regional-token'), true)
  })

  test('clearAuth removes auth files', () => {
    const deps = makeDeps()
    saveAuth({ region: 'https://usw-1.sealos.io', regional_token: 'regional-token' }, deps)
    saveKubeconfig(kubeconfig, deps)

    clearAuth(deps)

    assert.deepEqual(checkAuth(deps), { authenticated: false })
  })
})

describe('CLI command registration', () => {
  test('registers top-level auth commands and auth subcommands', () => {
    const program = createProgram()
    const topLevel = program.commands.map(command => command.name())

    assert.equal(topLevel.includes('login'), true)
    assert.equal(topLevel.includes('logout'), true)
    assert.equal(topLevel.includes('whoami'), true)
    assert.equal(topLevel.includes('auth'), true)

    const auth = program.commands.find(command => command.name() === 'auth')
    assert.ok(auth)
    assert.deepEqual(auth.commands.map(command => command.name()), ['check', 'info', 'list', 'switch'])
  })
})
