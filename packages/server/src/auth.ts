// Auth primitives: password hashing (scrypt, no native deps), opaque session
// tokens (stored HASHED so a DB leak can't be replayed), input validation, and
// a small in-memory login/register rate limiter. Public-facing, so no user
// enumeration and constant-time password comparison.
import { scryptSync, randomBytes, createHash, timingSafeEqual } from 'node:crypto'

const SCRYPT_KEYLEN = 64
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex')
  return { hash, salt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN)
  const stored = Buffer.from(hash, 'hex')
  return stored.length === derived.length && timingSafeEqual(stored, derived)
}

/** returns the opaque token to hand the client, plus the hash we persist */
export function newSessionToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: sha256(token) }
}
export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

export function validateUsername(u: unknown): string | null {
  if (typeof u !== 'string') return 'Username required.'
  const s = u.trim()
  if (s.length < 3 || s.length > 24) return 'Username must be 3–24 characters.'
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9 _.-]*[A-Za-z0-9])?$/.test(s)) return 'Username may use letters, digits, spaces, _ . - (not at the ends).'
  return null
}
export function validatePassword(p: unknown): string | null {
  // No strength/length rules by design — a weak password is the user's choice.
  // Only require a non-empty string (hashing needs one); the 256KB request-body
  // cap in index.ts already bounds size, so no password-specific limit.
  if (typeof p !== 'string' || p.length === 0) return 'Password required.'
  return null
}

// ---- rate limiter (per key = ip+route) : fixed window ----
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10
const buckets = new Map<string, { count: number; resetAt: number }>()

/** returns true if allowed, false if the caller has exceeded the window */
export function rateAllow(key: string): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now > b.resetAt) { buckets.set(key, { count: 1, resetAt: now + WINDOW_MS }); return true }
  if (b.count >= MAX_ATTEMPTS) return false
  b.count++
  return true
}
/** on a fully successful login/register we forgive the bucket */
export function rateReset(key: string): void { buckets.delete(key) }

// periodically drop stale buckets so the map can't grow unbounded
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k) }, WINDOW_MS).unref?.()
