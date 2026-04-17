"use client";

import * as React from "react";
import { Toaster, type ToasterProps } from "sonner";

/**
 * Direction B — Sonner toast provider.
 * Position responsive: bottom-right desktop, top-center mobile (<1024px).
 *
 * Không dùng `matchMedia` cho initial render để tránh SSR mismatch — đặt
 * default là `bottom-right` rồi hook đổi sau mount.
 */
export function SonnerProvider() {
  const [position, setPosition] =
    React.useState<ToasterProps["position"]>("bottom-right");

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
