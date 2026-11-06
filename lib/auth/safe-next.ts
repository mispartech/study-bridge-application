/** Only same-site paths, so a crafted sign-in link can't bounce a student to another site. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/discover"
}
