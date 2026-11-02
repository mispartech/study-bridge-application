import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** Temporary content for shell tabs whose features haven't been built yet. */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Coming soon</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <div>
          <Button variant="outline" asChild>
            <Link href="/dev">Browse the component library</Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}
