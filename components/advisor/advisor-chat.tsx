"use client"

import { Send } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { IncludesEstimates } from "@/components/match/estimated-tag"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { ProgrammeCard, Source } from "@/lib/advisor/tools"
import { COUNTRY_LABEL } from "@/lib/match/labels"
import { cn } from "@/lib/utils"

const MAX_CARDS = 3
const MAX_HISTORY = 12

type Message = {
  role: "user" | "assistant"
  text: string
  programmes: ProgrammeCard[]
  sources: Source[]
  failed?: boolean
}

const STARTERS = [
  "What can I afford on my budget?",
  "Which scholarships am I eligible for?",
  "Can I study in the USA with a Nigerian passport?",
]

const verified = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

function InlineCard({ card }: { card: ProgrammeCard }) {
  return (
    <Card data-testid="advisor-card" className="gap-1 p-3 sm:p-3">
      <h3 className="font-heading text-sm leading-snug font-bold">
        <Link href={`/programmes/${card.id}`} className="underline-offset-4 hover:underline">
          {card.title}
        </Link>
      </h3>
      <p className="text-xs text-muted-foreground">
        {card.university.replace(/^Demo — /, "")}, {card.city}, {COUNTRY_LABEL[card.country]}
      </p>
      {card.total_first_year && (
        <p className="money text-base font-bold">
          {card.total_first_year}
          {card.total_first_year_local && (
            <span className="text-sm font-normal text-muted-foreground"> ({card.total_first_year_local})</span>
          )}
        </p>
      )}
      <IncludesEstimates />
      {card.stale && <p className="text-xs text-warning-strong">Not verified in the last 120 days.</p>}
    </Card>
  )
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)\]]+)/g

function Inline({ text }: { text: string }) {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
    if (!link && !part.startsWith("http")) return part
    return (
      <a
        key={i}
        href={link?.[2] ?? part}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("underline", !link && "break-all")}
      >
        {link?.[1] ?? part}
      </a>
    )
  })
}

/** The few bits of Markdown the model uses. Built from React nodes, so a reply can't inject HTML. */
function AdvisorText({ text }: { text: string }) {
  const lines = text.split("\n").filter((line) => line.trim() && !/^\s*-{3,}\s*$/.test(line))
  return lines.map((line, i) => {
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    const bullet = line.match(/^\s*[*-]\s+(.*)$/)
    if (heading)
      return (
        <p key={i} className="font-semibold">
          <Inline text={heading[1]!.replace(/\*\*/g, "")} />
        </p>
      )
    if (bullet)
      return (
        <p key={i} className="pl-3 -indent-3">
          • <Inline text={bullet[1]!} />
        </p>
      )
    return (
      <p key={i}>
        <Inline text={line} />
      </p>
    )
  })
}

function dedupe<T>(items: T[], key: (item: T) => string) {
  return [...new Map(items.map((item) => [key(item), item])).values()]
}

export function AdvisorChat({ initialUsed, limit }: { initialUsed: number; limit: number | null }) {
  const [messages, setMessages] = React.useState<Message[]>([])
  const [input, setInput] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [used, setUsed] = React.useState(initialUsed)
  const [showSources, setShowSources] = React.useState(false)
  const [limited, setLimited] = React.useState(limit !== null && initialUsed >= limit)
  const remaining = limit === null ? null : Math.max(0, limit - used)

  const patchLast = (patch: (message: Message) => Message) =>
    setMessages((list) => [...list.slice(0, -1), patch(list.at(-1)!)])

  async function send(text: string) {
    const question = text.trim()
    if (!question || busy) return
    setInput("")
    setBusy(true)
    const history = [...messages, { role: "user" as const, text: question }]
      .filter((m) => m.text)
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.text }))
    setMessages((list) => [
      ...list,
      { role: "user", text: question, programmes: [], sources: [] },
      { role: "assistant", text: "", programmes: [], sources: [] },
    ])
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      })
      if (res.status === 429) {
        setLimited(true)
        setMessages((list) => list.slice(0, -2))
        setInput(question)
        return
      }
      const reader = res.ok ? res.body?.pipeThrough(new TextDecoderStream()).getReader() : undefined
      if (!reader) throw new Error("no stream")
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as
            | { type: "quota"; used: number }
            | { type: "text"; text: string }
            | { type: "tool"; programmes: ProgrammeCard[]; sources: Source[] }
            | { type: "error" }
          if (event.type === "quota") setUsed(event.used)
          else if (event.type === "text") patchLast((m) => ({ ...m, text: m.text + event.text }))
          else if (event.type === "tool") {
            patchLast((m) => ({
              ...m,
              programmes: dedupe([...m.programmes, ...event.programmes], (c) => c.id),
              sources: dedupe([...m.sources, ...event.sources], (s) => `${s.label}|${s.source_url}`),
            }))
          } else patchLast((m) => ({ ...m, failed: true }))
        }
      }
    } catch {
      patchLast((m) => ({ ...m, failed: true }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-extrabold">Advisor</h1>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p data-testid="messages-left" className="text-muted-foreground">
            {remaining === null ? "Unlimited messages" : `${remaining} of ${limit} messages left today`}
          </p>
          <label className="flex min-h-11 items-center gap-2 font-medium">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={showSources}
              onChange={(e) => setShowSources(e.target.checked)}
            />
            Show sources
          </label>
        </div>
      </header>

      {messages.length === 0 && !limited && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Ask about programmes, costs, scholarships and visas. Answers come from our verified records.
          </p>
          {STARTERS.map((starter) => (
            <Button
              key={starter}
              variant="outline"
              className="h-auto min-h-11 whitespace-normal"
              onClick={() => send(starter)}
            >
              {starter}
            </Button>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-3" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
            {(m.text || m.role === "user") && (
              <div
                data-testid={m.role === "user" ? "user-message" : "advisor-message"}
                className={cn(
                  "flex max-w-[90%] flex-col gap-2 rounded-card px-4 py-2 text-sm",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-surface"
                )}
              >
                {m.role === "user" ? m.text : <AdvisorText text={m.text} />}
              </div>
            )}
            {m.role === "assistant" && !m.text && !m.failed && busy && i === messages.length - 1 && (
              <span aria-label="Advisor is typing" className="h-3 w-24 animate-pulse rounded-full bg-surface-subtle" />
            )}
            {m.programmes.length > 0 && (
              <div className="flex w-full flex-col gap-2">
                {m.programmes.slice(0, MAX_CARDS).map((card) => (
                  <InlineCard key={card.id} card={card} />
                ))}
              </div>
            )}
            {showSources && m.sources.length > 0 && (
              <div data-testid="sources" className="w-full rounded-button bg-surface-subtle p-3 text-xs">
                <p className="mb-1 font-medium">Sources</p>
                <ul className="flex flex-col gap-1">
                  {m.sources.map((s) => (
                    <li key={`${s.label}|${s.source_url}`}>
                      {s.source_url.startsWith("http") ? (
                        <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                          {s.label.replace(/Demo — /g, "")}
                        </a>
                      ) : (
                        s.label.replace(/Demo — /g, "")
                      )}
                      <span className="text-muted-foreground"> verified {verified(s.last_verified_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {m.failed && (
              <p role="alert" className="text-sm text-danger-strong">
                Something went wrong answering that. Please try again.
              </p>
            )}
          </li>
        ))}
      </ul>

      {limited ? (
        <Card data-testid="limit-message" className="gap-1">
          <h2 className="font-heading text-lg font-bold">You&apos;ve used today&apos;s {limit} free messages</h2>
          <p className="text-sm text-muted-foreground">
            They reset at midnight, Lagos time. Your matches and shortlist are still here.
          </p>
        </Card>
      ) : (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
        >
          <textarea
            aria-label="Your question"
            rows={2}
            maxLength={2000}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a programme, a cost or a visa"
            className="min-h-11 flex-1 rounded-button border border-border bg-surface px-3 py-2 text-[0.9375rem]"
          />
          <Button type="submit" size="icon" aria-label="Send" loading={busy}>
            {!busy && <Send aria-hidden />}
          </Button>
        </form>
      )}
    </div>
  )
}
