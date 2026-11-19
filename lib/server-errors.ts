import { NextResponse } from "next/server"

/** A server variable isn't set. Carries names only, which are public in .env.example. */
export class MissingEnvError extends Error {
  readonly code = "SERVER_ENV_MISSING"
  constructor(readonly missing: string[]) {
    super(`Missing server environment variables: ${missing.join(", ")}`)
    this.name = "MissingEnvError"
  }
}

/** Throws MissingEnvError naming every variable that's unset, so one fix-and-redeploy clears them all. */
export function requireEnv<const T extends string>(...names: T[]): Record<T, string> {
  const missing = names.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) throw new MissingEnvError(missing)
  return Object.fromEntries(names.map((name) => [name, process.env[name]!.trim()])) as Record<T, string>
}

/** Supabase turned the service key down: it's set, but wrong for this project. */
const REJECTED_KEY = /invalid api key|jwt|unauthori[sz]ed|permission denied/i

export type ServerFailure = { status: number; body: { error: string; code: string; missing?: string[] } }

/** Turns a failure into a clear code. Only names and codes go out: no values, no raw messages. */
export function describeFailure(err: unknown): ServerFailure {
  if (err instanceof MissingEnvError) {
    return {
      status: 503,
      body: { error: "The service isn't configured", code: err.code, missing: err.missing },
    }
  }
  const message = err instanceof Error ? err.message : String(err)
  if (REJECTED_KEY.test(message)) {
    return {
      status: 503,
      body: { error: "The service isn't configured", code: "SERVER_ENV_REJECTED" },
    }
  }
  return { status: 500, body: { error: "Something went wrong", code: "SERVER_ERROR" } }
}

export function failureResponse(err: unknown) {
  const { status, body } = describeFailure(err)
  console.error(`${body.code}:`, err instanceof Error ? err.message : err)
  return NextResponse.json(body, { status })
}
