// @vitest-environment node
import { describe, expect, it } from "vitest"

import { scrubLinks, urlsIn } from "./link-guard"

const known = urlsIn({ apply_url: "https://northmoor.example.ac.uk/apply" })

describe("scrubLinks", () => {
  it("keeps a link a tool returned, even with trailing punctuation", () => {
    const text = "Apply at https://northmoor.example.ac.uk/apply."
    expect(scrubLinks(text, known)).toBe(text)
  })

  it("removes a link from anywhere else", () => {
    expect(scrubLinks("Try https://agent.example.com/fast now", known)).toBe(
      "Try [link removed: not from our records] now"
    )
  })

  it("drops the target of a Markdown link it doesn't know", () => {
    expect(scrubLinks("[Agent](https://agent.example.com)", known)).toBe("[Agent]")
    const good = "[Apply](https://northmoor.example.ac.uk/apply)"
    expect(scrubLinks(good, known)).toBe(good)
  })
})
