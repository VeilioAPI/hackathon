"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  LayoutGrid,
  Database,
  ShieldCheck,
  Settings,
  Building2,
  ChevronRight,
  FileClock,
  IdCard,
  Ban,
  ScrollText,
  Play,
  Network,
  FileCheck2,
  ScanEye,
} from "lucide-react"
import { cn } from "@/lib/utils"

const governanceChildren = [
  { label: "Access Requests", href: "/governance/access-requests", icon: FileClock },
  { label: "Access Passports", href: "/governance/passports", icon: IdCard },
  { label: "Consents", href: "/governance/consents", icon: FileCheck2 },
  { label: "Revocations", href: "/governance/revocations", icon: Ban },
  { label: "Audit Trail", href: "/governance/audit-trail", icon: ScrollText },
]

const nav = [
  { label: "Exchange", href: "/exchange", icon: LayoutGrid },
  { label: "My data exposure", href: "/exchange/my-data", icon: ScanEye },
  { label: "Jury Demo", href: "/demo", icon: Play },
  { label: "Insights", href: "/insights", icon: Network },
  { label: "Partners", href: "/partners", icon: Building2 },
  { label: "Datasets", href: "/datasets", icon: Database },
  { label: "Compliance", href: "/compliance", icon: FileCheck2 },
  { label: "Governance", href: "/governance", icon: ShieldCheck, children: governanceChildren },
  { label: "Settings", href: "/settings", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const [govOpen, setGovOpen] = useState(pathname.startsWith("/governance"))

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <Link
        href="/exchange"
        className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5 transition-colors hover:bg-sidebar-accent/50"
      >
        <Image
          src="/logoveilio.png"
          alt="Veilio"
          width={36}
          height={36}
          className="size-9 shrink-0 object-contain"
          priority
          unoptimized
        />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-sidebar-foreground">Veilio</p>
          <p className="text-xs text-muted-foreground">Exchange</p>
        </div>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = item.icon
          const isActive =
            pathname === item.href || (!item.children && pathname.startsWith(item.href))

          if (item.children) {
            const sectionActive = pathname.startsWith("/governance")
            return (
              <div key={item.label}>
                <button
                  onClick={() => setGovOpen((v) => !v)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    sectionActive
                      ? "text-sidebar-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4.5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronRight
                    className={cn(
                      "size-4 transition-transform",
                      govOpen && "rotate-90",
                    )}
                  />
                </button>
                {govOpen && (
                  <div className="mt-1 ml-5 space-y-1 border-l border-sidebar-border pl-3">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon
                      const childActive = pathname === child.href
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                            childActive
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <ChildIcon className="size-4 shrink-0" />
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4.5 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Financial assets are not the only assets that require trust.{" "}
          <span className="font-medium text-sidebar-foreground">Data does too.</span>
        </p>
      </div>
    </aside>
  )
}
