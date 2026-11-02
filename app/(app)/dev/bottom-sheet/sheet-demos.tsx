"use client"

import { useState } from "react"
import { SlidersHorizontal } from "lucide-react"

import { BottomSheet, BottomSheetClose } from "@/components/ui/bottom-sheet"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"

export function BasicSheetDemo() {
  return (
    <BottomSheet
      trigger={<Button>Open sheet</Button>}
      title="Sheet title"
      description="Drag the handle down, press Escape, or tap outside to close."
    >
      <p className="text-sm">
        Focus is trapped inside while open and returns to the trigger on close. Page scroll is locked.
      </p>
    </BottomSheet>
  )
}

const FILTERS = ["UK", "Canada", "USA", "Under budget", "January intake", "Scholarships"]

export function FilterSheetDemo() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(["UK"])
  const toggle = (f: string) => setSelected((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]))

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <SlidersHorizontal aria-hidden /> Filters
        {selected.length > 0 && (
          <Chip size="sm" variant="primary">
            {selected.length}
            <span className="sr-only"> selected</span>
          </Chip>
        )}
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Filter programmes"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
            <BottomSheetClose asChild>
              <Button className="flex-1">Show results</Button>
            </BottomSheetClose>
          </>
        }
      >
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 text-sm font-semibold">Demo filters</legend>
          {FILTERS.map((f) => {
            const on = selected.includes(f)
            return (
              <Button
                key={f}
                size="sm"
                variant={on ? "primary" : "outline"}
                aria-pressed={on}
                onClick={() => toggle(f)}
              >
                {f}
              </Button>
            )
          })}
        </fieldset>
        <div className="mt-6 flex flex-col gap-3 text-sm text-muted-foreground">
          {Array.from({ length: 8 }, (_, i) => (
            <p key={i}>Long content scrolls inside the sheet while the header and footer stay put. Line {i + 1}.</p>
          ))}
        </div>
      </BottomSheet>
    </>
  )
}
