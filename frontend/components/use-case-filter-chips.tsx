"use client"

import { categories, type Category } from "@/lib/view-models"
import { cn } from "@/lib/utils"

function useCaseLabel(useCase: string): string {
  if (useCase === "TradeFinance") return "Trade Finance"
  return useCase
}

export function UseCaseFilterChips({
  value,
  onChange,
}: {
  value: (typeof categories)[number]
  onChange: (value: (typeof categories)[number]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onChange(category)}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
            value === category
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          {category === "All" ? "All use cases" : useCaseLabel(category as Category)}
        </button>
      ))}
    </div>
  )
}
