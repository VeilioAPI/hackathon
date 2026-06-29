import { Shell } from "@/components/shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

function ToggleRow({
  title,
  description,
  enabled,
}: {
  title: string
  description: string
  enabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
          enabled ? "justify-end bg-primary" : "justify-start bg-input"
        }`}
        aria-hidden
      >
        <span className="size-5 rounded-full bg-card shadow-sm" />
      </span>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Shell title="Settings" subtitle="Organization, security, and governance defaults">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Organization Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">
                Organization Name
              </label>
              <input
                defaultValue="Veilio Financial Group"
                className="h-10 rounded-md border border-input bg-card px-3 text-sm outline-none ring-ring/40 focus:ring-2"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">
                Data Protection Officer
              </label>
              <input
                defaultValue="dpo@veilio.com"
                className="h-10 rounded-md border border-input bg-card px-3 text-sm outline-none ring-ring/40 focus:ring-2"
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm">Save Changes</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Governance Defaults</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border py-0">
            <ToggleRow
              title="Require approval before sharing"
              description="All new data-sharing agreements need compliance sign-off."
              enabled
            />
            <ToggleRow
              title="Auto-expire passports"
              description="Revoke access automatically when a passport reaches its end date."
              enabled
            />
            <ToggleRow
              title="Notify on high-risk shares"
              description="Alert governance leads when a high-risk relationship is created."
              enabled
            />
            <ToggleRow
              title="Allow recipient re-sharing"
              description="Permit external partners to forward datasets downstream."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border py-0">
            <ToggleRow
              title="Enforce SSO"
              description="Require single sign-on for all organization members."
              enabled
            />
            <ToggleRow
              title="Multi-factor authentication"
              description="Mandate MFA for access to governance controls."
              enabled
            />
            <div className="py-4">
              <Separator className="mb-4" />
              <Button variant="outline" size="sm">
                View Access Logs
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  )
}
