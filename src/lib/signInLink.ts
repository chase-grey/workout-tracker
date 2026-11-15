/**
 * A link that signs a new device into an existing account.
 *
 * It carries one of two credentials. A hosted account's key (`#key=`). Or, for
 * the owner, whose account predates keys and is reached with none, the owner
 * secret that unlocks the issue tooling (`#owner=`): with it the new device
 * goes into `legacy` mode, exactly like the owner's old phones.
 *
 * The credential rides in the fragment, not the query: a fragment never leaves
 * the device that opens it, so it isn't in Pages' request logs or a proxy's.
 * Whoever holds the link holds the account.
 */
export type SignInCredential = { kind: 'key'; key: string } | { kind: 'owner'; secret: string }

const PARAM = { key: 'key', owner: 'owner' } as const

export function signInLink(appUrl: string, cred: SignInCredential): string {
  const value = cred.kind === 'key' ? cred.key : cred.secret
  return `${appUrl.split('#')[0]}#${PARAM[cred.kind]}=${encodeURIComponent(value.trim())}`
}

/** The credential a sign-in link carried, from `location.hash`. */
export function credentialFromHash(hash: string): SignInCredential | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const key = params.get(PARAM.key)?.trim()
  if (key) return { kind: 'key', key }
  const secret = params.get(PARAM.owner)?.trim()
  if (secret) return { kind: 'owner', secret }
  return undefined
}

/** `href` with any sign-in credential taken out of its fragment. */
export function withoutCredential(href: string): string {
  const url = new URL(href)
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  if (!params.has(PARAM.key) && !params.has(PARAM.owner)) return href
  params.delete(PARAM.key)
  params.delete(PARAM.owner)
  const rest = params.toString()
  url.hash = rest ? `#${rest}` : ''
  return url.toString()
}

/**
 * What was pasted into the account-key field: a whole sign-in link (an iPhone
 * can't carry one into the installed app any other way), or a bare key.
 */
export function credentialFromText(text: string): SignInCredential | undefined {
  const t = text.trim()
  if (!t) return undefined
  const hash = t.indexOf('#')
  if (hash >= 0 && /^https?:\/\//i.test(t)) return credentialFromHash(t.slice(hash))
  return { kind: 'key', key: t }
}
