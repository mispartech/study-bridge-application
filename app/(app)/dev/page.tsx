import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DemoHeader } from "./_components/showcase"
import { DEV_ENTRIES } from "./_components/registry"

export default function DevIndex() {
  return (
    <>
      <DemoHeader title="Component library">
        Base components from /components/ui. Use the theme button in the top bar to check each one in dark mode.
      </DemoHeader>
      <ul className="grid gap-3 sm:grid-cols-2">
        {DEV_ENTRIES.map((entry) => (
          <li key={entry.slug}>
            <Link href={`/dev/${entry.slug}`} className="block rounded-card">
              <Card interactive className="flex-row items-center">
                <CardHeader className="flex-1">
                  <CardTitle as="h2" className="text-base">
                    {entry.name}
                  </CardTitle>
                  <CardDescription>{entry.summary}</CardDescription>
                </CardHeader>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
