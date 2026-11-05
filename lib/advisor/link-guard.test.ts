// @vitest-environment node
import { describe, expect, it } from "vitest"

import { linkGuard, scrubLinks, urlsIn } from "./link-guard"

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

describe("linkGuard", () => {
  it("catches a URL split across stream chunks", () => {
    const guard = linkGuard()
    const out = ["See htt", "ps://agent.exam", "ple.com for ", "help"].map((chunk) => guard.push(chunk)).join("")
    expect(out + guard.flush()).toBe("See [link removed: not from our records] for help")
  })

  it("lets through links from tool results, and loses no text", () => {
    const guard = linkGuard()
    guard.allow({ source_url: "https://northmoor.example.ac.uk/apply" })
    const out = guard.push("Apply: https://northmoor.example.ac.uk/apply\nGood luck")
    expect(out + guard.flush()).toBe("Apply: https://northmoor.example.ac.uk/apply\nGood luck")
  })
})
