import type { Metadata } from "next"
import { Bookmark, CircleCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Chip } from "@/components/ui/chip"
import { FitRing } from "@/components/ui/fit-ring"
import { FreshnessBadge } from "@/components/ui/freshness-badge"
import { Money } from "@/components/ui/money"
import { DEMO_NOW, daysBefore } from "../_components/demo-time"
import { DemoHeader, Example } from "../_components/showcase"

export const metadata: Metadata = { title: "Card" }

export default function CardPage() {
  return (
    <>
      <DemoHeader title="Card">
        16px radius, with header, content and footer slots. Padding is 16px on mobile and 24px from sm up.
      </DemoHeader>

      <Example title="Basic" className="block">
        <Card>
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Supporting description in muted text.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Body content goes here.</p>
          </CardContent>
        </Card>
      </Example>

      <Example title="Composed: programme card" note="All values below are fake demo data." className="block">
        <Card>
          <div className="flex items-start gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <CardTitle>MSc Demo Data Science</CardTitle>
              <CardDescription>Example University · Sampletown</CardDescription>
            </div>
            <FitRing score={82} band="strong" size="sm" />
          </div>
          <CardContent>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-muted-foreground">First-year cost</span>
              <Money amountMinor={4_250_000_000n} currency="NGN" className="font-semibold" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip size="sm" variant="success" icon={<CircleCheck aria-hidden />}>
                Meets grade requirement
              </Chip>
              <FreshnessBadge size="sm" lastVerifiedAt={daysBefore(12)} now={DEMO_NOW} />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="flex-1">View details</Button>
            <Button variant="outline" size="icon" aria-label="Save MSc Demo Data Science">
              <Bookmark aria-hidden />
            </Button>
          </CardFooter>
        </Card>
      </Example>

      <Example title="Interactive" note="For cards that are a single tap target; wrap in a link." className="block">
        <a href="#card-demo" className="block rounded-card">
          <Card interactive>
            <CardHeader>
              <CardTitle className="text-base">Tap me</CardTitle>
              <CardDescription>Lifts on hover, presses on tap.</CardDescription>
            </CardHeader>
          </Card>
        </a>
      </Example>
    </>
  )
}
