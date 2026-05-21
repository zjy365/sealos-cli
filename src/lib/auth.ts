import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import type { SealosAuthData, SealosWorkspace } from '../types/index.ts'

export const SEALOS_AUTH_CLIENT_ID = 'af993c98-d19d-4bdc-b338-79b80dc4f8bf'
export const DEFAULT_SEALOS_REGION = 'https://usw-1.sealos.io'
export const AUTH_METHOD_DEVICE_GRANT = 'oauth2_device_grant'
export const AUTH_METHOD_TOKEN = 'token'

const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

export interface SealosAuthPaths {
  sealosDir: string
  authPath: string
  kubeconfigPath: string
}

export interface AuthDependencies {
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  openBrowser?: (url: string) => void
  now?: () => Date
  paths?: SealosAuthPaths
  stderr?: Pick<NodeJS.WriteStream, 'write'>
}

interface DeviceAuthorizationResponse {
  device_code: string
  user_code: string
  verification_uri?: string
  verification_uri_complete?: string
  expires_in: number
  interval?: number
}

interface TokenResponse {
  access_token?: string
}

interface RegionTokenResponse {
  data?: {
    token?: string
    kubeconfig?: string
  }
}

interface NamespaceListResponse {
  data?: {
    namespaces?: SealosWorkspace[]
  } | SealosWorkspace[]
}

interface SwitchWorkspaceResponse {
  data?: {
    token?: string
  }
}

interface KubeconfigResponse {
  data?: {
    kubeconfig?: string
  }
}

export interface LoginResult {
  kubeconfig_path?: string
  region: string
  workspace: string
  limited?: boolean
}

export interface AuthStatus {
  authenticated: boolean
  kubeconfig_path?: string
  region?: string
  workspace?: string
}

export interface AuthInfo extends AuthStatus {
  auth_method?: string
  authenticated_at?: string
  current_workspace?: SealosAuthData['current_workspace'] | null
}

export interface WorkspaceListResult {
  current: string | null
  workspaces: SealosWorkspace[]
}

export interface SwitchWorkspaceResult {
  workspace: {
    uid?: string
    id?: string
    teamName?: string
  }
  kubeconfig_path: string
}

export function getAuthPaths (sealosDir = join(homedir(), '.sealos')): SealosAuthPaths {
  return {
    sealosDir,
    authPath: join(sealosDir, 'auth.json'),
    kubeconfigPath: join(sealosDir, 'kubeconfig')
  }
}

export function normalizeRegion (region?: string): string {
  return (region || process.env.SEALOS_REGION || DEFAULT_SEALOS_REGION).replace(/\/+$/, '')
}

export function createDefaultAuthDependencies (): Required<AuthDependencies> {
  return {
    fetch,
    sleep: async (ms: number) => await new Promise(resolve => setTimeout(resolve, ms)),
    openBrowser,
    now: () => new Date(),
    paths: getAuthPaths(),
    stderr: process.stderr
  }
}

function withDeps (deps: AuthDependencies = {}): Required<AuthDependencies> {
  return {
    ...createDefaultAuthDependencies(),
    ...deps
  }
}

function ensureSealosDir (paths: SealosAuthPaths): void {
  mkdirSync(paths.sealosDir, { recursive: true })
}

export function saveAuth (auth: SealosAuthData, deps: AuthDependencies = {}): void {
  const { paths } = withDeps(deps)
  ensureSealosDir(paths)
  writeFileSync(paths.authPath, JSON.stringify(auth, null, 2), { mode: 0o600 })
}

export function loadAuth (deps: AuthDependencies = {}): SealosAuthData {
  const { paths } = withDeps(deps)
  if (!existsSync(paths.authPath)) {
    throw new Error('Not authenticated. Please run: sealos-cli login')
  }

  return JSON.parse(readFileSync(paths.authPath, 'utf-8')) as SealosAuthData
}

export function getRegionalToken (deps: AuthDependencies = {}): string | null {
  try {
    return loadAuth(deps).regional_token || null
  } catch {
    return null
  }
}

export function getKubeconfigContent (deps: AuthDependencies = {}): string | null {
  const { paths } = withDeps(deps)
  try {
    return readFileSync(paths.kubeconfigPath, 'utf-8')
  } catch {
    return null
  }
}

export function getAuthHeaders (deps: AuthDependencies = {}): { Authorization: string } | null {
  const kubeconfig = getKubeconfigContent(deps)
  return kubeconfig ? { Authorization: encodeURIComponent(kubeconfig) } : null
}

export function requireAuth (deps: AuthDependencies = {}): { Authorization: string } {
  const headers = getAuthHeaders(deps)
  if (!headers) {
    throw new Error('Authentication required. Please run "sealos-cli login" first.')
  }
  return headers
}

export function saveKubeconfig (kubeconfig: string, deps: AuthDependencies = {}): void {
  const { paths } = withDeps(deps)
  ensureSealosDir(paths)
  writeFileSync(paths.kubeconfigPath, kubeconfig, { mode: 0o600 })
}

export function clearAuth (deps: AuthDependencies = {}): void {
  const { paths } = withDeps(deps)
  rmSync(paths.authPath, { force: true })
  rmSync(paths.kubeconfigPath, { force: true })
}

export function checkAuth (deps: AuthDependencies = {}): AuthStatus {
  const { paths } = withDeps(deps)
  if (!existsSync(paths.kubeconfigPath)) {
    return { authenticated: false }
  }

  try {
    const kubeconfig = readFileSync(paths.kubeconfigPath, 'utf-8')
    if (!kubeconfig.includes('server:') || (!kubeconfig.includes('token:') && !kubeconfig.includes('client-certificate'))) {
      return { authenticated: false }
    }

    const auth: Partial<SealosAuthData> = existsSync(paths.authPath)
      ? JSON.parse(readFileSync(paths.authPath, 'utf-8')) as SealosAuthData
      : {}

    return {
      authenticated: true,
      kubeconfig_path: paths.kubeconfigPath,
      region: auth.region || 'unknown',
      workspace: auth.current_workspace?.id || 'unknown'
    }
  } catch {
    return { authenticated: false }
  }
}

export function getAuthInfo (deps: AuthDependencies = {}): AuthInfo {
  const { paths } = withDeps(deps)
  const status = checkAuth(deps)
  if (!status.authenticated) {
    return { authenticated: false }
  }

  const auth: Partial<SealosAuthData> = existsSync(paths.authPath)
    ? JSON.parse(readFileSync(paths.authPath, 'utf-8')) as SealosAuthData
    : {}

  return {
    ...status,
    auth_method: auth.auth_method || 'unknown',
    authenticated_at: auth.authenticated_at || 'unknown',
    current_workspace: auth.current_workspace || null
  }
}

async function parseResponse<T> (res: Response): Promise<T> {
  return await res.json() as T
}

async function readErrorBody (res: Response): Promise<string> {
  return await res.text().catch(() => '')
}

export async function requestDeviceAuthorization (region: string, deps: AuthDependencies = {}): Promise<DeviceAuthorizationResponse> {
  const { fetch: fetchImpl } = withDeps(deps)
  const res = await fetchImpl(`${region}/api/auth/oauth2/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SEALOS_AUTH_CLIENT_ID,
      grant_type: DEVICE_GRANT_TYPE
    })
  })

  if (!res.ok) {
    const body = await readErrorBody(res)
    throw new Error(`Device authorization request failed (${res.status}): ${body || res.statusText}`)
  }

  return await parseResponse<DeviceAuthorizationResponse>(res)
}

export async function pollForToken (
  region: string,
  deviceCode: string,
  interval: number,
  expiresIn: number,
  deps: AuthDependencies = {}
): Promise<TokenResponse> {
  const { fetch: fetchImpl, sleep, now, stderr } = withDeps(deps)
  const maxWait = Math.min(expiresIn, 600) * 1000
  const deadline = now().getTime() + maxWait
  let pollInterval = interval * 1000
  let lastLoggedMinute = -1

  while (now().getTime() < deadline) {
    await sleep(pollInterval)

    const remaining = Math.ceil((deadline - now().getTime()) / 60000)
    if (remaining !== lastLoggedMinute && remaining > 0) {
      lastLoggedMinute = remaining
      stderr.write(`  Waiting for authorization... (${remaining} min remaining)\n`)
    }

    const res = await fetchImpl(`${region}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SEALOS_AUTH_CLIENT_ID,
        grant_type: DEVICE_GRANT_TYPE,
        device_code: deviceCode
      })
    })

    if (res.ok) {
      return await parseResponse<TokenResponse>(res)
    }

    const body = await res.json().catch(() => ({})) as { error?: string }
    switch (body.error) {
      case 'authorization_pending':
        break
      case 'slow_down':
        pollInterval += 5000
        break
      case 'access_denied':
        throw new Error('Authorization denied by user')
      case 'expired_token':
        throw new Error('Device code expired. Please run login again.')
      default:
        throw new Error(`Token request failed: ${body.error || res.statusText}`)
    }
  }

  throw new Error('Authorization timed out (10 minutes). Please run login again.')
}

export async function getRegionToken (region: string, globalToken: string, deps: AuthDependencies = {}): Promise<RegionTokenResponse> {
  const { fetch: fetchImpl } = withDeps(deps)
  const res = await fetchImpl(`${region}/api/auth/regionToken`, {
    method: 'POST',
    headers: {
      Authorization: globalToken,
      'Content-Type': 'application/json'
    }
  })

  if (!res.ok) {
    const body = await readErrorBody(res)
    throw new Error(`Region token exchange failed (${res.status}): ${body || res.statusText}`)
  }

  return await parseResponse<RegionTokenResponse>(res)
}

function normalizeWorkspaces (data: NamespaceListResponse): SealosWorkspace[] {
  const namespaces = Array.isArray(data.data) ? data.data : data.data?.namespaces
  return Array.isArray(namespaces) ? namespaces : []
}

export async function listRemoteWorkspaces (region: string, regionalToken: string, deps: AuthDependencies = {}): Promise<SealosWorkspace[]> {
  const { fetch: fetchImpl } = withDeps(deps)
  const res = await fetchImpl(`${region}/api/auth/namespace/list`, {
    headers: { Authorization: regionalToken }
  })

  if (!res.ok) {
    const body = await readErrorBody(res)
    throw new Error(`List workspaces failed (${res.status}): ${body || res.statusText}`)
  }

  return normalizeWorkspaces(await parseResponse<NamespaceListResponse>(res))
}

export async function switchRemoteWorkspace (
  region: string,
  regionalToken: string,
  nsUid: string,
  deps: AuthDependencies = {}
): Promise<SwitchWorkspaceResponse> {
  const { fetch: fetchImpl } = withDeps(deps)
  const res = await fetchImpl(`${region}/api/auth/namespace/switch`, {
    method: 'POST',
    headers: {
      Authorization: regionalToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ns_uid: nsUid })
  })

  if (!res.ok) {
    const body = await readErrorBody(res)
    throw new Error(`Switch workspace failed (${res.status}): ${body || res.statusText}`)
  }

  return await parseResponse<SwitchWorkspaceResponse>(res)
}

export async function getKubeconfig (region: string, regionalToken: string, deps: AuthDependencies = {}): Promise<KubeconfigResponse> {
  const { fetch: fetchImpl } = withDeps(deps)
  const res = await fetchImpl(`${region}/api/auth/getKubeconfig`, {
    headers: { Authorization: regionalToken }
  })

  if (!res.ok) {
    const body = await readErrorBody(res)
    throw new Error(`Get kubeconfig failed (${res.status}): ${body || res.statusText}`)
  }

  return await parseResponse<KubeconfigResponse>(res)
}

export function openBrowser (url: string): void {
  const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url]
  execFileSync(command, args, { stdio: 'ignore' })
}

export async function loginWithToken (region: string, token: string, deps: AuthDependencies = {}): Promise<LoginResult> {
  const { now } = withDeps(deps)
  const normalizedRegion = normalizeRegion(region)
  saveAuth({
    region: normalizedRegion,
    regional_token: token,
    authenticated_at: now().toISOString(),
    auth_method: AUTH_METHOD_TOKEN
  }, deps)

  return {
    region: normalizedRegion,
    workspace: 'unknown',
    limited: true
  }
}

export async function loginWithDeviceFlow (region?: string, deps: AuthDependencies = {}): Promise<LoginResult> {
  const fullDeps = withDeps(deps)
  const normalizedRegion = normalizeRegion(region)
  const deviceAuth = await requestDeviceAuthorization(normalizedRegion, fullDeps)
  const {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: verificationUriComplete,
    expires_in: expiresIn,
    interval = 5
  } = deviceAuth

  const url = verificationUriComplete || verificationUri
  fullDeps.stderr.write(`\nPlease open the following URL in your browser to authorize:\n\n  ${url}\n\nAuthorization code: ${userCode}\nExpires in: ${Math.floor(expiresIn / 60)} minutes\n\nWaiting for authorization...\n`)

  if (url) {
    try {
      fullDeps.openBrowser(url)
      fullDeps.stderr.write('Browser opened automatically.\n')
    } catch {
      fullDeps.stderr.write('Could not open browser automatically. Please open the URL manually.\n')
    }
  }

  const tokenResponse = await pollForToken(normalizedRegion, deviceCode, interval, expiresIn, fullDeps)
  const accessToken = tokenResponse.access_token
  if (!accessToken) {
    throw new Error('Token response missing access_token')
  }

  fullDeps.stderr.write('Authorization received. Exchanging for regional token...\n')

  const regionData = await getRegionToken(normalizedRegion, accessToken, fullDeps)
  const regionalToken = regionData.data?.token
  const kubeconfig = regionData.data?.kubeconfig
  if (!regionalToken) {
    throw new Error('Region token response missing data.token field')
  }
  if (!kubeconfig) {
    throw new Error('Region token response missing data.kubeconfig field')
  }

  let currentWorkspace: SealosWorkspace | undefined
  try {
    const workspaces = await listRemoteWorkspaces(normalizedRegion, regionalToken, fullDeps)
    currentWorkspace = workspaces.find(workspace => workspace.nstype === 'private') || workspaces[0]
  } catch {
    currentWorkspace = undefined
  }

  saveKubeconfig(kubeconfig, fullDeps)
  saveAuth({
    region: normalizedRegion,
    access_token: accessToken,
    regional_token: regionalToken,
    authenticated_at: fullDeps.now().toISOString(),
    auth_method: AUTH_METHOD_DEVICE_GRANT,
    ...(currentWorkspace
      ? {
          current_workspace: {
            uid: currentWorkspace.uid,
            id: currentWorkspace.id,
            teamName: currentWorkspace.teamName
          }
        }
      : {})
  }, fullDeps)

  fullDeps.stderr.write('Authentication successful!\n')

  return {
    kubeconfig_path: fullDeps.paths.kubeconfigPath,
    region: normalizedRegion,
    workspace: currentWorkspace?.id || 'default'
  }
}

export async function listWorkspaces (deps: AuthDependencies = {}): Promise<WorkspaceListResult> {
  const auth = loadAuth(deps)
  if (!auth.regional_token) {
    throw new Error('No regional_token found. Please run: sealos-cli login')
  }

  const workspaces = await listRemoteWorkspaces(auth.region, auth.regional_token, deps)
  return {
    current: auth.current_workspace?.id || null,
    workspaces: workspaces.map(workspace => ({
      uid: workspace.uid,
      id: workspace.id,
      teamName: workspace.teamName,
      role: workspace.role,
      nstype: workspace.nstype
    }))
  }
}

export async function switchWorkspace (target: string, deps: AuthDependencies = {}): Promise<SwitchWorkspaceResult> {
  if (!target) {
    throw new Error('Usage: sealos-cli auth switch <namespace-id-or-uid>')
  }

  const fullDeps = withDeps(deps)
  const auth = loadAuth(fullDeps)
  if (!auth.regional_token) {
    throw new Error('No regional_token found. Please run: sealos-cli login')
  }

  const workspaces = await listRemoteWorkspaces(auth.region, auth.regional_token, fullDeps)
  if (workspaces.length === 0) {
    throw new Error('No workspaces found')
  }

  const targetLower = target.toLowerCase()
  const match = workspaces.find(workspace =>
    workspace.id === target ||
    workspace.uid === target ||
    workspace.id?.toLowerCase().includes(targetLower) ||
    workspace.teamName?.toLowerCase().includes(targetLower)
  )

  if (!match?.uid) {
    const available = workspaces.map(workspace => `  ${workspace.id || 'unknown'} (${workspace.teamName || 'unknown'})`).join('\n')
    throw new Error(`No workspace matching "${target}". Available:\n${available}`)
  }

  fullDeps.stderr.write(`Switching to workspace: ${match.id || match.uid} (${match.teamName || 'unknown'})...\n`)
  const switchData = await switchRemoteWorkspace(auth.region, auth.regional_token, match.uid, fullDeps)
  const newToken = switchData.data?.token
  if (!newToken) {
    throw new Error('Switch response missing data.token')
  }

  const kubeconfigData = await getKubeconfig(auth.region, newToken, fullDeps)
  const kubeconfig = kubeconfigData.data?.kubeconfig
  if (!kubeconfig) {
    throw new Error('Kubeconfig response missing data.kubeconfig')
  }

  const nextAuth: SealosAuthData = {
    ...auth,
    regional_token: newToken,
    current_workspace: {
      uid: match.uid,
      id: match.id,
      teamName: match.teamName
    }
  }
  saveAuth(nextAuth, fullDeps)
  saveKubeconfig(kubeconfig, fullDeps)

  fullDeps.stderr.write(`Switched to workspace: ${match.id || match.uid}\n`)

  return {
    workspace: {
      uid: match.uid,
      id: match.id,
      teamName: match.teamName
    },
    kubeconfig_path: fullDeps.paths.kubeconfigPath
  }
}
