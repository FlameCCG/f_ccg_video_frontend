export type OAuthProvider = 'github' | 'x'

export interface OAuthSessionPayload {
  codeVerifier: string
  createdAt: number
  state: string
}

const OAUTH_SESSION_KEY_PREFIX = 'oauth-session'

const toBase64Url = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const getOAuthSessionKey = (provider: OAuthProvider) => {
  return `${OAUTH_SESSION_KEY_PREFIX}:${provider}`
}

const getRandomBytes = (length: number) => {
  const bytes = new Uint8Array(length)
  window.crypto.getRandomValues(bytes)
  return bytes
}

export const createOAuthState = () => {
  return toBase64Url(getRandomBytes(18))
}

export const createCodeVerifier = () => {
  return toBase64Url(getRandomBytes(48))
}

export const createCodeChallenge = async (codeVerifier: string) => {
  const hash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))

  return toBase64Url(hash)
}

export const saveOAuthSession = (provider: OAuthProvider, payload: OAuthSessionPayload) => {
  window.sessionStorage.setItem(getOAuthSessionKey(provider), JSON.stringify(payload))
}

export const consumeOAuthSession = (provider: OAuthProvider): OAuthSessionPayload | null => {
  const key = getOAuthSessionKey(provider)
  const raw = window.sessionStorage.getItem(key)
  window.sessionStorage.removeItem(key)

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<OAuthSessionPayload>
    if (
      typeof parsed.codeVerifier !== 'string' ||
      typeof parsed.state !== 'string' ||
      typeof parsed.createdAt !== 'number'
    ) {
      return null
    }

    return {
      codeVerifier: parsed.codeVerifier,
      createdAt: parsed.createdAt,
      state: parsed.state,
    }
  } catch {
    return null
  }
}

export const clearOAuthSession = (provider: OAuthProvider) => {
  window.sessionStorage.removeItem(getOAuthSessionKey(provider))
}
