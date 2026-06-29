"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { api, ensureAuthToken, type BankRecord } from "@/lib/api"

const STORAGE_KEY = "veilio-exchange-viewer-hint"

type PartnerContextValue = {
  banks: BankRecord[]
  viewerHint: string | null
  viewer: BankRecord | null
  setViewerHint: (hint: string) => void
  refreshBanks: () => Promise<void>
  loading: boolean
}

const PartnerContext = createContext<PartnerContextValue | null>(null)

export function PartnerProvider({ children }: { children: ReactNode }) {
  const [banksState, setBanksState] = useState<BankRecord[]>([])
  const [viewerHint, setViewerHintState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const banks = useMemo(() => {
    const seen = new Set<string>()
    return banksState.filter((bank) => {
      if (seen.has(bank.hint)) return false
      seen.add(bank.hint)
      return true
    })
  }, [banksState])

  const refreshBanks = useCallback(async () => {
    const rows = await api.banks()
    setBanksState(rows)
  }, [])

  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null
    if (stored) {
      setViewerHintState(stored)
      void ensureAuthToken(stored, "partner").catch(() => undefined)
    }
    refreshBanks()
      .catch(() => setBanksState([]))
      .finally(() => setLoading(false))
  }, [refreshBanks])

  useEffect(() => {
    if (!viewerHint && banks.length > 0) {
      const preferred =
        banks.find((bank) => bank.hint === "BankA")?.hint ?? banks[0]?.hint ?? null
      if (preferred) {
        setViewerHintState(preferred)
        window.localStorage.setItem(STORAGE_KEY, preferred)
      }
    }
  }, [banks, viewerHint])

  const setViewerHint = useCallback((hint: string) => {
    setViewerHintState(hint)
    window.localStorage.setItem(STORAGE_KEY, hint)
    void ensureAuthToken(hint, "partner").catch(() => undefined)
  }, [])

  const viewer = useMemo(
    () => banks.find((bank) => bank.hint === viewerHint) ?? null,
    [banks, viewerHint],
  )

  const value = useMemo(
    () => ({
      banks,
      viewerHint,
      viewer,
      setViewerHint,
      refreshBanks,
      loading,
    }),
    [banks, viewerHint, viewer, setViewerHint, refreshBanks, loading],
  )

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>
}

export function usePartnerContext(): PartnerContextValue {
  const ctx = useContext(PartnerContext)
  if (!ctx) {
    throw new Error("usePartnerContext must be used within PartnerProvider")
  }
  return ctx
}
