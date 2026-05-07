"use client";

import * as React from "react";
import { Toaster, type ToasterProps } from "sonner";
import { useTheme } from "./ThemeProvider";

/**
 * Direction B — Sonner toast provider.
 * Position responsive: bottom-right desktop, top-center mobile (<1024px).
 * V3.7.68 — theme follow useTheme (light/dark/system).
 */
export function SonnerProvider() {
  const [position, setPosition] =
    React.useState<ToasterProps["position"]>("bottom-right");
  const { resolved } = useTheme();

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1024px)");
    const update = () => {
      setPosition(mql.matches ? "top-center" : "bottom-right");
    };
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return (
    <Toaster
      position={position}
      theme={resolved}
      richColors
      closeButton
      duration={5_000}
      toastOptions={{
        classNames: {
          toast: "shadow-toast",
        },
      }}
    />
  );
}
