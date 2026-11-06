import type { Metadata } from "next"
import { Suspense } from "react"

import { SignInForm } from "@/components/account/sign-in-form"
import { Logo } from "@/components/shell/app-shell"

export const metadata: Metadata = { title: "Sign in", robots: { index: false } }

export default function Page() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-4 pb-10">
      <header>
        <Logo />
      </header>
      <main>
        <Suspense>
          <SignInForm />
        </Suspense>
      </main>
    </div>
  )
}
