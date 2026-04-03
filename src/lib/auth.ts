import { getCurrentContext } from './config.ts'
import { AuthError } from './errors.ts'

/**
 * Get auth token from the current context (set by `sealos login`).
 */
export function getToken (): string | null {
  const context = getCurrentContext()
  return context?.token || null
}

/**
 * Get auth headers for API calls.
 * Uses the kubeconfig stored via `sealos login -t <kubeconfig>` or browser login.
 * The OpenAPI kubeconfigAuth scheme expects URL-encoded kubeconfig in Authorization header.
 */
export function getAuthHeaders (): { Authorization: string } | null {
  const token = getToken()
  if (!token) return null
  return { Authorization: encodeURIComponent(token) }
}

/**
 * Require auth — throws AuthError if user hasn't logged in, returns auth headers.
 */
export function requireAuth (): { Authorization: string } {
  const headers = getAuthHeaders()
  if (!headers) {
    throw new AuthError()
  }
  return headers
}
