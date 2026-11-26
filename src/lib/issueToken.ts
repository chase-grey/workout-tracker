/**
 * What a device proves itself to the backend's issue routes with.
 *
 * Two things do (see provesOwner in SimpleBackend.gs). The owner's own account
 * key, which every device signed in as the owner holds. And the issue token
 * typed into Settings, which is all the owner's phones had before accounts.
 *
 * **The key goes first, and a typed token never stands in its way.** The
 * token is typed once and nothing checks it again, so a phone can carry one
 * that has since been changed or was never right. On 2026-11-25 the owner's
 * phone was signed in and still could not file: its typed token went ahead of
 * its key and the backend answered "Bad chat secret". A token only matters on
 * a device with no key to offer, and whichever proof is refused, the other is
 * tried (see services/issues).
 *
 * Only the owner's key is offered. Anyone else's would be refused, and their
 * reports go to the feedback tab without it (see lib/coachFeedback).
 */
import type { Settings } from '../services/storage'
import { ownerFlavour } from './profile'

type Proofs = Pick<Settings, 'chatToken' | 'accountMode' | 'accountToken' | 'profile'>

/** Every proof this device can offer, the one to try first leading. */
export function issueProofs(settings: Proofs): string[] {
  const key =
    settings.accountMode === 'hosted' && ownerFlavour(settings.profile) ? (settings.accountToken?.trim() ?? '') : ''
  const typed = settings.chatToken.trim()
  return [...new Set([key, typed].filter(Boolean))]
}

/** The proof to lead with, or '' on a device that has none. */
export function issueToken(settings: Proofs): string {
  return issueProofs(settings)[0] ?? ''
}

/** Whether an issue route refused the proof it was handed, as opposed to failing some other way. */
export function proofRefused(error: unknown): boolean {
  return error instanceof Error && /Bad chat secret/.test(error.message)
}

/**
 * Run `call` with each proof in turn until one is taken. Only a refusal moves
 * on to the next: any other failure is the answer, and trying again could file
 * the same report twice.
 */
export async function withProof<T>(proofs: string[], call: (proof: string) => Promise<T>): Promise<T> {
  let refused: unknown
  for (const proof of proofs) {
    try {
      return await call(proof)
    } catch (e) {
      if (!proofRefused(e)) throw e
      refused = e
    }
  }
  throw refused
}
