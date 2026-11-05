import type { Metadata } from "next"

import { Logo } from "@/components/shell/app-shell"
import { Card } from "@/components/ui/card"
import { DATA_WE_STORE } from "@/lib/account/consent"

export const metadata: Metadata = { title: "Privacy notice" }

export default function Page() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-10">
      <header>
        <Logo />
      </header>
      <main className="flex flex-col gap-4 text-sm">
        <h1 className="text-2xl font-extrabold">Privacy notice</h1>
        <p role="note" className="rounded-button bg-warning-tint p-3 text-warning-strong">
          Draft. This notice has not had legal review, and the company details and contact address still need adding.
        </p>
        <Card className="gap-2">
          <h2 className="font-heading text-lg font-bold">What we store and why</h2>
          <ul className="flex flex-col gap-2">
            {DATA_WE_STORE.map((item) => (
              <li key={item.what}>
                <strong>{item.what}.</strong> {item.why}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="gap-2">
          <h2 className="font-heading text-lg font-bold">Our legal basis</h2>
          <p>We process your data with your consent, under the Nigeria Data Protection Act 2023.</p>
        </Card>
        <Card className="gap-2">
          <h2 className="font-heading text-lg font-bold">Who else sees it</h2>
          <p>
            Your account and profile are stored with Supabase. Your advisor messages and the profile details needed to
            answer them are sent to our AI provider. We don&apos;t sell your data.
          </p>
        </Card>
        <Card className="gap-2">
          <h2 className="font-heading text-lg font-bold">Your rights</h2>
          <p>
            You can see, correct or delete your data, withdraw your consent at any time, and complain to the Nigeria
            Data Protection Commission.
          </p>
        </Card>
      </main>
    </div>
  )
}
