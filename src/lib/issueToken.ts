/**
 * What a device proves itself to the backend's issue routes with.
 *
 * Two things do (see provesOwner in SimpleBackend.gs). The issue token typed
 * into Settings, which is all the owner's phones had before accounts. And the
 * owner's own account key: a device that signed in by email, or off another
 * device's sign-in link, was never given the token, and until the key counted
 * the coach there answered every report with "add your issue token"
 * (2026-11-25).
 *
 * Only the owner's key is offered. Anyone else's would be refused, and their
 * reports go to the feedback tab without it (see lib/coachFeedback).
 */
import type { Settings } from '../services/storage'
import { ownerFlavour } from './profile'

export function issueToken(
  settings: Pick<Settings, 'chatToken' | 'accountMode' | 'accountToken' | 'profile'>,
): string {
  const typed = settings.chatToken.trim()
  if (typed) return typed
  if (settings.accountMode !== 'hosted' || !ownerFlavour(settings.profile)) return ''
  return settings.accountToken?.trim() ?? ''
}
