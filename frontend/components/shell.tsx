import type { ReactNode } from "react"
import { Bell } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { PartnerSwitcher } from "@/components/partner-switcher"
import { Button } from "@/components/ui/button"

export function Shell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <AppSidebar />
      <div className="flex h-svh flex-col overflow-y-auto bg-background md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-8">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <PartnerSwitcher />
          {action}
          <Button
            variant="outline"
            size="icon"
            className="relative size-9 shrink-0"
            aria-label="Notifications"
          >
            <Bell className="size-4" />
            <span className="absolute right-2 top-2 size-1.5 rounded-full bg-destructive" />
          </Button>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </>
  )
}
