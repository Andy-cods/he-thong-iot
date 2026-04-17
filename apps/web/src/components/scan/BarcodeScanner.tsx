"use client";

import * as React from "react";
import { Camera, CameraOff, Keyboard, Send, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * V2 BarcodeScanner — design-spec §3.7.2.
 *
 * Card padding 16 border zinc-200 rounded-md. Camera area aspect-[4/3]
 * bg-zinc-900 rounded-sm (thay slate-900). Permission denied fallback:
 * Input h-9 + "Nhập tay barcode" hint. Scan feedback: flash border 3px
 * emerald-500/red-500 400ms. Audio beep 880Hz success / 220Hz error /
 * 660Hz dup. USB keyboard wedge detect giữ < 80ms/char logic V1.
 *
 * GIỮ 3 nguồn input V1:
 * 1. Camera (html5-qrcode lazy import khi bấm "Bật camera").
 * 2. USB/BT wedge — keystroke timing < 80ms/char, pause 100ms tự submit.
 * 3. Manual text input — fallback.
 *
 * IME safe: skip `e.isComposing` để không ăn phím khi user gõ tiếng Việt.
 */

export interface BarcodeScannerProps {
  onDetect: (code: string) => void;
  onError?: (err: Error) => void;
  enableSound?: boolean;
  disabled?: boolean;
  liveRegionLabel?: string;
}

type FlashKind = "success" | "danger" | "dup" | null;

const CAMERA_DENIED_KEY = "iot:pwa:camera-denied";

function beep(freq: number) {
  try {
    const AC = (globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    }).AudioContext ?? (globalThis as unknown as {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch {
    // silent
  }
}

export function BarcodeScanner({
  onDetect,
  onError,
  enableSound = true,
  disabled = false,
  liveRegionLabel = "Kết quả quét",
}: BarcodeScannerProps) {
  const [mode, setMode] = React.useState<"idle" | "camera" | "manual">("idle");
  const [soundOn, setSoundOn] = React.useState(enableSound);
  const [cameraDenied, setCameraDenied] = React.useState(false);
  const [manual, setManual] = React.useState("");
  const [liveText, setLiveText] = React.useState("");
  const [flash, setFlash] = React.useState<FlashKind>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  const scannerRef = React.useRef<HTMLDivElement | null>(null);
  const instanceRef = React.useRef<unknown>(null);
  const lastCodeRef = React.useRef<{ code: string; at: number } | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setPrefersReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    try {
      setCameraDenied(
        window.localStorage.getItem(CAMERA_DENIED_KEY) === "1",
      );
    } catch {
      // ignore
    }
  }, []);

  const playFeedback = React.useCallback(
    (kind: "success" | "danger" | "dup") => {
      if (!prefersReducedMotion) setFlash(kind);
      if (soundOn) {
        const freq = kind === "success" ? 880 : kind === "dup" ? 660 : 220;
        beep(freq);
      }
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(
          kind === "success" ? 40 : kind === "dup" ? [30, 30, 30] : [80, 40, 80],
        );
      }
      window.setTimeout(() => setFlash(null), 400);
    },
    [prefersReducedMotion, soundOn],
  );

  const handleDetect = React.useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      // Dup detection: cùng mã trong 800ms → beep dup thay vì fire onDetect
      const now = performance.now();
      const last = lastCodeRef.current;
      if (last && last.code === trimmed && now - last.at < 800) {
        setLiveText(`Trùng mã ${trimmed}`);
        playFeedback("dup");
        return;
      }
      lastCodeRef.current = { code: trimmed, at: now };
      onDetect(trimmed);
      setLiveText(`Đã quét ${trimmed}`);
      playFeedback("success");
    },
    [onDetect, playFeedback],
  );

  // USB/BT wedge detection — giữ logic V1 (< 80ms/char, pause 100ms)
  React.useEffect(() => {
    if (disabled) return;
    if (typeof window === "undefined") return;
    const buf: string[] = [];
    const times: number[] = [];
    let timer: number | null = null;

    const flush = () => {
      const code = buf.join("");
      buf.length = 0;
      times.length = 0;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (code.length >= 6) {
        handleDetect(code);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) {
        return;
      }
      const now = performance.now();
      if (e.key === "Enter") {
        if (buf.length > 0) {
          e.preventDefault();
          flush();
        }
        return;
      }
      if (e.key.length !== 1) return;

      if (times.length > 0) {
        const delta = now - times[times.length - 1]!;
        if (delta > 80) {
          buf.length = 0;
          times.length = 0;
        }
      }
      buf.push(e.key);
      times.push(now);

      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (buf.length >= 6) flush();
        else {
          buf.length = 0;
          times.length = 0;
        }
      }, 100);
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer) window.clearTimeout(timer);
    };
  }, [disabled, handleDetect]);

  const startCamera = async () => {
    if (disabled) return;
    try {
      const mod = await import("html5-qrcode");
      const { Html5Qrcode } = mod;
      if (!scannerRef.current) return;
      const elId = "barcode-scanner-region";
      scannerRef.current.id = elId;
      const instance = new Html5Qrcode(elId);
      instanceRef.current = instance;
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 160 } },
        (decodedText) => handleDetect(decodedText),
        () => {
          // ignore frame errors
        },
      );
      setMode("camera");
      setCameraDenied(false);
      try {
        window.localStorage.removeItem(CAMERA_DENIED_KEY);
      } catch {
        // ignore
      }
    } catch (err) {
      const e = err as Error;
      setCameraDenied(true);
      try {
        window.localStorage.setItem(CAMERA_DENIED_KEY, "1");
      } catch {
        // ignore
      }
      setMode("manual");
      onError?.(e);
      playFeedback("danger");
    }
  };

  const stopCamera = React.useCallback(async () => {
    const inst = instanceRef.current as {
      stop?: () => Promise<void>;
      clear?: () => void;
    } | null;
    if (inst && typeof inst.stop === "function") {
      try {
        await inst.stop();
        inst.clear?.();
      } catch {
        // ignore
      }
    }
    instanceRef.current = null;
    setMode("idle");
  }, []);

  React.useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = manual.trim();
    if (v.length === 0) return;
    handleDetect(v);
    setManual("");
  };

  return (
    <div
      className={cn(
        "rounded-md border bg-white p-4 transition-[border-color,box-shadow] duration-150",
        flash === "success" &&
          "border-emerald-500 ring-[3px] ring-emerald-500/30",
        flash === "danger" &&
          "border-red-500 ring-[3px] ring-red-500/30 animate-shake",
        flash === "dup" && "border-amber-500 ring-[3px] ring-amber-500/30",
        !flash && "border-zinc-200",
      )}
      aria-busy={disabled}
    >
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveRegionLabel}: {liveText}
      </div>

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-md font-semibold text-zinc-900">Quét mã vạch</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setSoundOn((s) => !s)}
          aria-label={soundOn ? "Tắt âm thanh" : "Bật âm thanh"}
          className="h-11 w-11"
        >
          {soundOn ? (
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <VolumeX className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {cameraDenied ? (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          <CameraOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Camera không khả dụng. Dùng máy quét USB (gắn vào rồi quét thẳng)
            hoặc nhập tay bên dưới.
          </span>
        </div>
      ) : null}

      {mode === "camera" ? (
        <div className="mt-3 space-y-2">
          <div
            ref={scannerRef}
            className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-sm bg-zinc-900"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => void stopCamera()}
            >
              <CameraOff className="h-4 w-4" aria-hidden="true" />
              Dừng camera
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {!cameraDenied ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => void startCamera()}
              disabled={disabled}
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              Bật camera để quét
            </Button>
          ) : null}

          <form
            onSubmit={handleManualSubmit}
            className="flex items-end gap-2"
          >
            <div className="flex-1">
              <label
                htmlFor="barcode-manual"
                className="mb-1 flex items-center gap-1 text-xs font-medium text-zinc-600"
              >
                <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                Nhập tay barcode hoặc dùng máy quét USB
              </label>
              <Input
                id="barcode-manual"
                size="lg"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Quét / gõ SKU hoặc barcode rồi bấm Enter"
                autoComplete="off"
                disabled={disabled}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={disabled || manual.trim().length === 0}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Gửi
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
