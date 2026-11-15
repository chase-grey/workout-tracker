/**
 * What the backend will accept as an email and a password (SimpleBackend.gs
 * checkEmail / checkPassword), checked here first so a form can hold its
 * button back instead of sending something it already knows will bounce.
 */
export const PASSWORD_MIN = 8

export function normEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function emailOk(email: string): boolean {
  const e = normEmail(email)
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

export function passwordOk(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= 200
}

export function loginOk(email: string, password: string): boolean {
  return emailOk(email) && passwordOk(password)
}
