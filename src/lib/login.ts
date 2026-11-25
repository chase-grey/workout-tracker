/**
 * What the backend will accept as an email and a password (SimpleBackend.gs
 * checkEmail / checkPassword), checked here first so a form can hold its
 * button back instead of sending something it already knows will bounce.
 */
export const PASSWORD_MIN = 8

export function normEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** The backend's EMAIL_PATTERN, character for character; change both together. */
const EMAIL_PATTERN = /^[a-z0-9_][a-z0-9._%+-]*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

export function emailOk(email: string): boolean {
  const e = normEmail(email)
  return e.length <= 254 && EMAIL_PATTERN.test(e)
}

export function passwordOk(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= 200
}

export function loginOk(email: string, password: string): boolean {
  return emailOk(email) && passwordOk(password)
}
