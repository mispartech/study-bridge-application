"use client"

import * as React from "react"
import { AnimatePresence, LazyMotion, m, MotionConfig, useDragControls, type PanInfo } from "framer-motion"
import { X } from "lucide-react"
import { Dialog } from "radix-ui"

import { cn } from "@/lib/utils"

// Animation code loads on idle rather than with the page, keeping it out of the first-load
// bundle. Shared across sheets so it is fetched once.
type MotionFeatures = (typeof import("./motion-features"))["default"]
let loadedFeatures: MotionFeatures | null = null
let pendingFeatures: Promise<MotionFeatures> | null = null
function preloadFeatures() {
  pendingFeatures ??= import("./motion-features").then((mod) => (loadedFeatures = mod.default))
  return pendingFeatures
}

// Dragging the handle further than this, or flicking faster, dismisses the sheet.
const DISMISS_OFFSET_PX = 120
const DISMISS_VELOCITY = 500

const PANEL_CLASS =
  "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-card bg-surface text-ink shadow-[0_-8px_32px_rgb(21_19_43/0.16)] outline-none sm:bottom-4 sm:rounded-card"
const OVERLAY_CLASS = "fixed inset-0 z-50 bg-scrim"

type BottomSheetProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Element that opens the sheet; rendered via Radix `asChild`. */
  trigger?: React.ReactNode
  title: string
  description?: string
  /** Sticky actions pinned to the bottom of the sheet. */
  footer?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

function BottomSheet({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  children,
  className,
}: BottomSheetProps) {
  // Controlled or uncontrolled; AnimatePresence needs to know the state to animate exit.
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolledOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange]
  )

  const [features, setFeatures] = React.useState(loadedFeatures)
  React.useEffect(() => {
    if (features) return
    const load = () => void preloadFeatures().then(setFeatures)
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(load, { timeout: 3000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(load, 1)
    return () => clearTimeout(id)
  }, [features])

  // Each open decides once whether it animates. If the user opens before the motion code
  // has arrived (likely on slow 3G), that open is plain: an exit animation that started
  // without its feature code would never finish and the sheet would stay on screen.
  const [animated, setAnimated] = React.useState(false)
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setAnimated(features !== null)
  }

  const dragControls = useDragControls()
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET_PX || info.velocity.y > DISMISS_VELOCITY) setOpen(false)
  }

  const describedBy = description ? {} : { "aria-describedby": undefined }

  const body = (
    <>
      <div
        className={cn(
          "flex h-6 shrink-0 items-center justify-center",
          animated && "cursor-grab touch-none active:cursor-grabbing"
        )}
        onPointerDown={animated ? (e) => dragControls.start(e) : undefined}
        aria-hidden
      >
        <span className="h-1 w-10 rounded-full bg-track" />
      </div>
      <div className="flex items-start gap-3 px-4 pb-2 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Dialog.Title className="font-heading text-lg font-bold">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="text-sm text-muted-foreground">{description}</Dialog.Description>
          )}
        </div>
        <Dialog.Close
          className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-button text-muted-foreground hover:bg-surface-subtle hover:text-ink"
          aria-label="Close"
        >
          <X className="size-5" aria-hidden />
        </Dialog.Close>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">{children}</div>
      {footer && (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          {footer}
        </div>
      )}
    </>
  )

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      {animated && features ? (
        <LazyMotion features={features} strict>
          <MotionConfig reducedMotion="user">
            <AnimatePresence>
              {open && (
                <Dialog.Portal forceMount>
                  <Dialog.Overlay asChild forceMount>
                    <m.div
                      className={OVERLAY_CLASS}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    />
                  </Dialog.Overlay>
                  <Dialog.Content asChild forceMount {...describedBy}>
                    <m.div
                      data-slot="bottom-sheet"
                      className={cn(PANEL_CLASS, className)}
                      initial={{ y: "100%" }}
                      animate={{ y: 0 }}
                      exit={{ y: "100%" }}
                      transition={{ type: "spring", damping: 32, stiffness: 320 }}
                      drag="y"
                      dragListener={false}
                      dragControls={dragControls}
                      dragConstraints={{ top: 0, bottom: 0 }}
                      dragElastic={{ top: 0, bottom: 0.6 }}
                      onDragEnd={onDragEnd}
                    >
                      {body}
                    </m.div>
                  </Dialog.Content>
                </Dialog.Portal>
              )}
            </AnimatePresence>
          </MotionConfig>
        </LazyMotion>
      ) : (
        <Dialog.Portal>
          <Dialog.Overlay className={OVERLAY_CLASS} />
          <Dialog.Content data-slot="bottom-sheet" className={cn(PANEL_CLASS, className)} {...describedBy}>
            {body}
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  )
}

const BottomSheetClose = Dialog.Close

export { BottomSheet, BottomSheetClose, type BottomSheetProps }
