import type { Metadata } from "next"
import { ArrowRight, Bookmark, ExternalLink, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DemoHeader, Example } from "../_components/showcase"

export const metadata: Metadata = { title: "Button" }

export default function ButtonPage() {
  return (
    <>
      <DemoHeader title="Button">
        12px radius. The default md size is 44px tall, the minimum comfortable touch target.
      </DemoHeader>

      <Example title="Variants" code={`<Button variant="primary">Apply</Button>`}>
        <Button>Primary</Button>
        <Button variant="accent">Accent</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Remove</Button>
        <Button variant="link">Link</Button>
      </Example>

      <Example title="Sizes">
        <Button size="sm">Small 36</Button>
        <Button size="md">Medium 44</Button>
        <Button size="lg">Large 52</Button>
        <Button size="icon" variant="outline" aria-label="Save to shortlist">
          <Bookmark aria-hidden />
        </Button>
      </Example>

      <Example title="With icons">
        <Button>
          <Plus aria-hidden /> Add to shortlist
        </Button>
        <Button variant="outline">
          See matches <ArrowRight aria-hidden />
        </Button>
      </Example>

      <Example title="States" note="Loading disables the button and sets aria-busy.">
        <Button loading>Saving</Button>
        <Button disabled>Disabled</Button>
      </Example>

      <Example
        title="As a link, full width"
        note="asChild renders the child element, e.g. an official apply link."
        code={`<Button asChild block>\n  <a href={programme.applyUrl}>Apply on university site</a>\n</Button>`}
      >
        <Button asChild block variant="primary">
          <a href="#apply-demo">
            Apply on university site <ExternalLink aria-hidden />
          </a>
        </Button>
      </Example>
    </>
  )
}
