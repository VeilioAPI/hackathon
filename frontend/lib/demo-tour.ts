import { api } from "@/lib/api"

export const KYC_DATASET = "DS-CUSTOMER-KYC-2026"
export const KYC_PASSPORT_DEFAULT = "VP-KYC-DEMO-001"
export const DEMO_STEP_COUNT = 5

/** Pause so the user can read banners and see UI changes. */
export function demoPause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Active KYC passport for the demo — re-seeds if the stored id was revoked. */
export async function resolveKycPassportId(currentId: string): Promise<string> {
  try {
    const detail = await api.passport(currentId)
    if (detail.status === "Active") return currentId
  } catch {
    // stale or missing — fall through
  }

  const passports = await api.passports({ ownerHint: "BankA" })
  const active = passports.find(
    (row) => row.datasetId === KYC_DATASET && row.status === "Active",
  )
  if (active) return active.passportId

  const result = await api.seedDemo()
  const kyc = result.scenarios.find((row) => row.datasetId === KYC_DATASET)
  return kyc?.passportId ?? currentId
}
