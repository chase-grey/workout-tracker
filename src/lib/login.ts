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

/** What the backend's register says when the email is already an account's (its ACCOUNT_NOT_MADE). */
export const ACCOUNT_NOT_MADE = 'Could not create that account'

/**
 * Make an account, or sign in to it when it is already there.
 *
 * The backend's register refuses a taken email without looking at the password,
 * so only its login, which counts wrong tries, can hand out a key. A phone that
 * made its account and never heard back would otherwise be stuck: asking again
 * is refused. So a refusal for that reason is followed by a sign-in with the
 * same email and password. When that fails too the refusal is what's reported;
 * it says nothing about whose email it is.
 */
export async function registerOrSignIn<T>(register: () => Promise<T>, signIn: () => Promise<T>): Promise<T> {
  try {
    return await register()
  } catch (refused) {
    if (!(refused instanceof Error) || !refused.message.includes(ACCOUNT_NOT_MADE)) throw refused
    try {
      return await signIn()
    } catch {
      throw refused
    }
  }
}
