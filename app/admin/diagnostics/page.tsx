import { SentryTest } from "@/components/admin/sentry-test"

export default function Page() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-lg font-bold">Diagnostics</h1>
      <p className="text-sm text-muted-foreground">
        Sends a test error from the server and from this browser. Both should appear in Sentry within a minute.
      </p>
      <SentryTest />
    </div>
  )
}
