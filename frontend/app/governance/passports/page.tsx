import { Shell } from "@/components/shell"
import { PassportsView } from "@/components/passports-view"

export default function PassportsPage() {
  return (
    <Shell
      title="Access Passports"
      subtitle="Purpose-bound and revocable proofs for institutional dataset access"
    >
      <PassportsView />
    </Shell>
  )
}
