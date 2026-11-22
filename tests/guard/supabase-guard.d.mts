export const PRODUCTION_SUPABASE_REFS: string[]
export const TEST_ENV_FILE: string
export function assertNotProduction(env?: Record<string, string | undefined>): void
export function loadTestEnv(): void
