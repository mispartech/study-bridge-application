import { adminFromRequest } from "@/lib/auth/admin"

/** Admin-only. Throws on purpose, so the server error reaches Sentry through onRequestError. */
export async function POST() {
  const { denied } = await adminFromRequest()
  if (denied) return denied
  throw new Error(`StudyBridge Sentry test (server) ${new Date().toISOString()}`)
}
