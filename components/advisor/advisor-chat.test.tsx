import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AdvisorChat } from "./advisor-chat"

afterEach(() => vi.unstubAllGlobals())

describe("AdvisorChat", () => {
  it("shows Checking figures… until the checked answer arrives", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, body }))
    )
    const encoder = new TextEncoder()
    const emit = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))

    render(<AdvisorChat initialUsed={0} limit={5} />)
    await userEvent.type(screen.getByLabelText("Your question"), "What will it cost?")
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(screen.queryByTestId("checking")).toBeNull()

    emit({ type: "checking" })
    await waitFor(() => expect(screen.getByTestId("checking").textContent).toBe("Checking figures…"))

    emit({ type: "text", text: "It's in our records." })
    controller.close()
    await waitFor(() => expect(screen.getByTestId("advisor-message").textContent).toContain("in our records"))
    expect(screen.queryByTestId("checking")).toBeNull()
  })
})
