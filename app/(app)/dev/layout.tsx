import "./dev.css"

import type { Metadata } from "next"
import { FlaskConical } from "lucide-react"

import { DevNav } from "./_components/dev-nav"

export const metadata: Metadata = {
  title: { default: "Component library", template: "%s · Components · StudyBridge" },
  robots: { index: false, follow: false },
}

export default function DevLayout({ children }: LayoutProps<"/dev">) {
  return (
    <div className="flex flex-col gap-6">
      <DevNav />
      <p className="flex items-start gap-2 rounded-button bg-warning-tint px-3 py-2 text-sm text-warning-strong">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Developer preview. Every name, amount, date and visa status on these pages is made-up demo data, not real
          programme or visa information.
        </span>
      </p>
      <div className="flex flex-col gap-8">{children}</div>
    </div>
  )
}
