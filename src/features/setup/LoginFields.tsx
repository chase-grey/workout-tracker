/**
 * Email and password, for signing in or making an account. `fresh` is a new
 * password being chosen, which is what tells a password manager to offer one.
 */
export function LoginFields({
  email,
  password,
  onEmail,
  onPassword,
  fresh,
  fieldClass,
  labelClass,
}: {
  email: string
  password: string
  onEmail: (v: string) => void
  onPassword: (v: string) => void
  fresh: boolean
  fieldClass: string
  labelClass: string
}) {
  return (
    <>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>email</span>
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          autoComplete={fresh ? 'new-password' : 'current-password'}
          minLength={fresh ? 8 : undefined}
          className={fieldClass}
        />
      </label>
    </>
  )
}
