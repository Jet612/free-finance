"use client";

import { useSyncExternalStore } from "react";

const subscribeToCapability = () => () => {};
const getBrowserCapability = () => "PublicKeyCredential" in window;
const getServerCapability = () => false;

export function usePasskeySupport() {
  return useSyncExternalStore(
    subscribeToCapability,
    getBrowserCapability,
    getServerCapability,
  );
}
