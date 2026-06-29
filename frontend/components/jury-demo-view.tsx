"use client"

import { useCallback, useRef, useState } from "react"
import { ExchangeCatalog } from "@/components/exchange-catalog"
import {
  DemoTourBanner,
  type DemoTourBannerState,
} from "@/components/demo-tour-banner"
import { DatasetAccessSheet } from "@/components/dataset-access-sheet"
import {
  GuidedDemoPanel,
  type DemoStepId,
} from "@/components/guided-demo-panel"
import { PassportDetailSheet } from "@/components/passport-detail-sheet"
import { usePartnerContext } from "@/contexts/partner-context"
import { api } from "@/lib/api"
import {
  DEMO_STEP_COUNT,
  KYC_DATASET,
  KYC_PASSPORT_DEFAULT,
  demoPause,
  resolveKycPassportId,
} from "@/lib/demo-tour"

const KYC_TITLE = "Corporate Customer KYC Package"

const STEP_NUM: Record<DemoStepId, number> = {
  seed: 1,
  owner: 2,
  "recipient-preview": 3,
  revoke: 4,
  denied: 5,
}

function scrollToDataset(datasetId: string) {
  window.setTimeout(() => {
    document
      .getElementById(`catalog-dataset-${datasetId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, 500)
}

export function JuryDemoView() {
  const catalogRef = useRef<HTMLDivElement>(null)
  const continueResolverRef = useRef<(() => void) | null>(null)
  const { setViewerHint } = usePartnerContext()
  const [demoTick, setDemoTick] = useState(0)
  const [highlightDatasetId, setHighlightDatasetId] = useState<string | null>(null)
  const [accessOpen, setAccessOpen] = useState(false)
  const [accessRequesterHint, setAccessRequesterHint] = useState<string | null>(null)
  const [passportOpen, setPassportOpen] = useState(false)
  const [kycPassportId, setKycPassportId] = useState(KYC_PASSPORT_DEFAULT)
  const [tourBanner, setTourBanner] = useState<DemoTourBannerState | null>(null)

  const showBanner = useCallback(
    (
      step: DemoStepId,
      title: string,
      message: string,
      tone: "primary" | "success" | "error" = "primary",
      waitingForContinue = false,
    ) => {
      setTourBanner({
        step: { current: STEP_NUM[step], total: DEMO_STEP_COUNT },
        title,
        message,
        tone,
        waitingForContinue,
      })
    },
    [],
  )

  const waitForContinue = useCallback(() => {
    return new Promise<void>((resolve) => {
      setTourBanner((prev) =>
        prev ? { ...prev, waitingForContinue: true } : prev,
      )
      continueResolverRef.current = () => {
        continueResolverRef.current = null
        setTourBanner((prev) =>
          prev ? { ...prev, waitingForContinue: false } : prev,
        )
        resolve()
      }
    })
  }, [])

  const handleContinue = useCallback(() => {
    continueResolverRef.current?.()
  }, [])

  const executeDemoStep = useCallback(
    async (step: DemoStepId) => {
      setHighlightDatasetId(null)
      setAccessOpen(false)
      setPassportOpen(false)

      if (step === "seed") {
        showBanner(
          step,
          "Loading demo network",
          "We create 6 partners and 3 governed datasets on Canton, with tokenized files sealed in the Veilio vault. Watch the catalog populate below.",
          "primary",
        )
        await demoPause(1800)

        const result = await api.seedDemo()
        const kyc = result.scenarios.find((row) => row.datasetId === KYC_DATASET)
        if (kyc?.passportId) {
          setKycPassportId(kyc.passportId)
        }
        setDemoTick((value) => value + 1)
        setHighlightDatasetId(KYC_DATASET)
        catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        scrollToDataset(KYC_DATASET)

        showBanner(
          step,
          "Exchange catalog populated",
          "3 governed datasets are listed. The KYC card « Corporate Customer KYC Package » is highlighted — this is the thread of the demo.",
          "success",
        )
        return
      }

      if (step === "owner") {
        showBanner(
          step,
          "Data owner perspective",
          "We switch to « Meridian Bank » (BankA). It deposited the KYC dataset and issued an Access Passport for VeriTrust. Watch the organization selector in the top right.",
          "primary",
        )
        await demoPause(2000)

        setViewerHint("BankA")
        setDemoTick((value) => value + 1)
        setHighlightDatasetId(KYC_DATASET)
        catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        scrollToDataset(KYC_DATASET)

        showBanner(
          step,
          "You are Meridian Bank",
          "As the owner, you see the KYC dataset in the catalog. VeriTrust holds an active passport to access it — we will show that in the next step.",
          "success",
        )
        return
      }

      if (step === "recipient-preview") {
        showBanner(
          step,
          "Recipient perspective (VeriTrust KYC)",
          "We switch to VeriTrust KYC (KYCProvider), the partner receiving the data. With an active passport, they can preview tokenized rows — never raw PII on Canton.",
          "primary",
        )
        await demoPause(2200)

        setViewerHint("KYCProvider")
        setDemoTick((value) => value + 1)
        setHighlightDatasetId(KYC_DATASET)
        scrollToDataset(KYC_DATASET)
        await demoPause(1200)

        setAccessRequesterHint("KYCProvider")
        setAccessOpen(true)

        showBanner(
          step,
          "Preview panel open",
          "On the right: governed preview of the CSV file (TOK_* tokenized columns). This is access authorized by the active passport. Take time to explore the panel.",
          "success",
        )
        return
      }

      if (step === "revoke") {
        setAccessOpen(false)

        showBanner(
          step,
          "Revocation by the owner",
          "Back to Meridian Bank. The KYC purpose is fulfilled: the owner revokes the passport. Revocation is recorded immediately on Canton — auditable proof.",
          "primary",
        )
        await demoPause(2200)

        setViewerHint("BankA")
        const passportId = await resolveKycPassportId(kycPassportId)
        setKycPassportId(passportId)

        setPassportOpen(true)
        await demoPause(1500)

        try {
          await api.revokePermission({
            permissionId: passportId,
            revocationId: `REV-${passportId}-${Date.now().toString(36)}`,
            reason: "KYC purpose completed — guided demo",
          })
          setDemoTick((value) => value + 1)
          setPassportOpen(true)

          showBanner(
            step,
            "Passport revoked on Canton",
            "The right panel shows passport detail and the ledger timeline (Revoked event). Status becomes « Revoked » — access is cut for VeriTrust.",
            "success",
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Revoke failed"
          if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("revoked")) {
            const freshId = await resolveKycPassportId(passportId)
            if (freshId !== passportId) {
              setKycPassportId(freshId)
              try {
                await api.revokePermission({
                  permissionId: freshId,
                  revocationId: `REV-${freshId}-${Date.now().toString(36)}`,
                  reason: "KYC purpose completed — guided demo",
                })
                setDemoTick((value) => value + 1)
                setPassportOpen(true)
                showBanner(
                  step,
                  "Passport revoked on Canton",
                  "A newly active passport was revoked. Check the right panel for ledger proof.",
                  "success",
                )
                return
              } catch {
                // fall through
              }
            }
            showBanner(
              step,
              "Passport already revoked",
              "The passport was already inactive. The right panel shows the current Canton state.",
              "success",
            )
          } else {
            showBanner(
              step,
              "Revocation issue",
              `${msg}. The passport panel stays open for inspection.`,
              "error",
            )
          }
        }
        return
      }

      if (step === "denied") {
        setPassportOpen(false)

        showBanner(
          step,
          "Access attempt after revocation",
          "VeriTrust tries to open the KYC dataset preview again. Without an active passport, the backend denies access — proof that governance is enforced.",
          "primary",
        )
        await demoPause(2200)

        setViewerHint("KYCProvider")
        setDemoTick((value) => value + 1)
        setHighlightDatasetId(KYC_DATASET)
        scrollToDataset(KYC_DATASET)
        await demoPause(1200)

        setAccessRequesterHint("KYCProvider")
        setAccessOpen(true)

        showBanner(
          step,
          "Access denied (403)",
          "The preview panel shows « access denied ». VeriTrust can no longer read the file — the Canton revocation is effective. End of demo.",
          "error",
        )
      }
    },
    [setViewerHint, showBanner, kycPassportId],
  )

  return (
    <div className="space-y-6">
      <DemoTourBanner
        banner={tourBanner}
        onDismiss={() => setTourBanner(null)}
        onContinue={handleContinue}
      />

      <GuidedDemoPanel
        onExecuteStep={executeDemoStep}
        onPauseBetweenSteps={waitForContinue}
      />

      <div ref={catalogRef}>
        <ExchangeCatalog key={demoTick} highlightDatasetId={highlightDatasetId} />
      </div>

      <DatasetAccessSheet
        open={accessOpen}
        onOpenChange={setAccessOpen}
        datasetId={KYC_DATASET}
        datasetTitle={KYC_TITLE}
        requesterHint={accessRequesterHint ?? "KYCProvider"}
      />

      <PassportDetailSheet
        open={passportOpen}
        onOpenChange={setPassportOpen}
        passportId={kycPassportId}
      />
    </div>
  )
}
