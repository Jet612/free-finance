"use client";

import { useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { amountsHidden, setAmountsHidden } from "@/lib/privacy";

const listeners = new Set<() => void>();

export function toggleAmounts() {
  setAmountsHidden(!amountsHidden());
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAmountsHidden() {
  return useSyncExternalStore(subscribe, amountsHidden, () => false);
}

export function PrivacyToggle() {
  const hidden = useAmountsHidden();
  const label = hidden ? "Show amounts" : "Hide amounts";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={hidden}
      title={label}
      onClick={toggleAmounts}
    >
      {hidden ? <EyeOff /> : <Eye />}
    </Button>
  );
}
