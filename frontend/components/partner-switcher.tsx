"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Building2, Check, ChevronDown } from "lucide-react"
import { usePartnerContext } from "@/contexts/partner-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function PartnerSwitcher({ className }: { className?: string }) {
  const { banks, viewerHint, viewer, setViewerHint, loading } = usePartnerContext()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(
    null,
  )

  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const node = rootRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      setMenuStyle({
        top: rect.bottom + 6,
        left: rect.right - Math.max(rect.width, 240),
        width: Math.max(rect.width, 240),
      })
    }
    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      const menu = document.getElementById("partner-switcher-menu")
      if (menu?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  const sortedBanks = useMemo(
    () => [...banks].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [banks],
  )

  if (loading) {
    return (
      <div
        className={cn(
          "h-9 w-52 animate-pulse rounded-md border border-border bg-muted/50",
          className,
        )}
      />
    )
  }

  if (banks.length === 0) {
    return (
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground",
          className,
        )}
      >
        <Building2 className="size-3.5" />
        No partners yet
      </div>
    )
  }

  const current = viewer ?? banks.find((bank) => bank.hint === viewerHint)

  const menu =
    open && menuStyle
      ? createPortal(
          <div
            id="partner-switcher-menu"
            role="listbox"
            aria-label="Select organization context"
            style={{
              position: "fixed",
              top: menuStyle.top,
              left: menuStyle.left,
              width: menuStyle.width,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-lg border border-border bg-card p-1 text-card-foreground shadow-xl ring-1 ring-border/60"
          >
            {sortedBanks.map((bank) => {
              const active = bank.hint === viewerHint
              return (
                <button
                  key={bank.hint}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setViewerHint(bank.hint)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/15 text-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{bank.displayName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{bank.hint}</span>
                  </span>
                  {active ? <Check className="size-4 shrink-0 text-primary" /> : null}
                </button>
              )
            })}
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((value) => !value)}
        className="h-9 min-w-[12rem] justify-between gap-2 border-border bg-card px-3 font-normal text-foreground hover:bg-muted"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Building2 className="size-3.5 shrink-0 text-primary" />
          <span className="truncate text-left leading-tight">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              Viewing as
            </span>
            <span className="block truncate text-sm font-medium text-foreground">
              {current?.displayName ?? "Select organization"}
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </Button>
      {menu}
    </div>
  )
}
