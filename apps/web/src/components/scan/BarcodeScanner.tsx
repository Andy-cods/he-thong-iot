"use client";

import * as React from "react";
import { Camera, CameraOff, Keyboard, Send, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * BarcodeScanner — design-spec §3.17 + brainstorm-deep §2.5 / §3.
 *
 * 3 nguồn đầu vào:
 * 1. Camera (html5-qrcode) — lazy khi user bấm "Bật camera".
 * 2. USB/Bluetooth wedge — keystroke timing < 30ms/char, pause 100ms tự submit.
 * 3. Manual text input — fallback khi camera denied + không có wedge.
 *
 * IME safe: skip `e.isComposing` để không ăn phím khi user gõ tiếng Việt.
 * Visual feedback: animate-flash-success / animate-flash-danger, optional beep
 * 880Hz/220Hz qua Web Audio API.
 */

export interface BarcodeScannerProps {
  onDetect: (code: string) => void;
  onError?: (err: Error) => void;
  enableSound?: boolean;
  disabled?: boolean;
  /** Label vùng live-region để a11y announce. Default "Kết quả quét". */
  liveRegionLabel?: string;
}

type FlashKind = "success" | "danger" | null;

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
    // silent — browser block audio context trước user gesture
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

  // Init reduced-motion check + camera-denied flag
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

  /** Play flash + beep feedback. */
  const playFeedback = React.useCallback(
    (kind: "success" | "danger") => {
      if (!prefersReducedMotion) setFlash(kind);
      if (soundOn) beep(kind === "success" ? 880 : 220);
      // Haptic — nếu browser hỗ trợ
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(kind === "success" ? 40 : [80, 40, 80]);
      }
      window.setTimeout(() => setFlash(null), 600);
    },
    [prefersReducedMotion, soundOn],
  );

  const handleDetect = React.useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      onDetect(trimmed);
      setLiveText(`Đã quét ${trimmed}`);
      playFeedback("success");
    },
    [onDetect, playFeedback],
  );

  // ── USB/Bluetooth wedge detection (global key listener) ─────────────
  // Buffer keystroke; submit khi Enter hoặc pause 100ms, và chỉ khi inter-keystroke
  // time < 30ms (chứng tỏ là máy quét, không phải user gõ tay).
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
      // Skip khi user đang focus input/textarea (trừ các input dedicated trong scanner)
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) {
        // Cho phép Enter trong manual input xử lý riêng.
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
      if (e.key.length !== 1) return; // bỏ các phím điều khiển (Shift, Alt, F1…)

      // Đo inter-keystroke
      if (times.length > 0) {
        const delta = now - times[times.length - 1]!;
        if (delta > 80) {
          // User gõ tay — reset buffer (không phải wedge)
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

  // ── Camera start/stop ────────────────────────────────────────────────
  const startCamera = async () => {
    if (disabled) return;
    try {
      // html5-qrcode dynamic import — nặng ~120KB, chỉ load khi cần
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
          // ignore individual frame errors — chỉ alert khi stop
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
        "rounded-lg border border-slate-200 bg-white p-4 transition-all",
        flash === "success" && "animate-flash-success",
        flash === "danger" && "animate-flash-danger",
      )}
      aria-busy={disabled}
    >
      {/* Live region for screen readers */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveRegionLabel}: {liveText}
      </div>

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Quét mã vạch
        </h3>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSoundOn((s) => !s)}
            aria-label={soundOn ? "Tắt âm" : "Bật âm"}
            className="h-10 w-10 p-0"
          >
            {soundOn ? (
              <Volume2 className="h-4 w-4" aria-hidden />
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      {cameraDenied ? (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-md border border-warning/20 bg-warning-soft px-3 py-2 text-sm text-warning-strong"
        >
          <CameraOff className="h-4 w-4 shrink-0" aria-hidden />
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
            className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-md bg-slate-900"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => void stopCamera()}
            >
              <CameraOff className="h-4 w-4" aria-hidden />
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
              className="w-full min-h-[48px]"
              onClick={() => void startCamera()}
              disabled={disabled}
            >
              <Camera className="h-4 w-4" aria-hidden />
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
                className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600"
              >
                <Keyboard className="h-3.5 w-3.5" aria-hidden />
                Nhập tay hoặc dùng máy quét USB
              </label>
              <Input
                id="barcode-manual"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Quét / gõ SKU hoặc barcode rồi bấm Enter"
                autoComplete="off"
                className="h-12"
                disabled={disabled}
              />
            </div>
            <Button
              type="submit"
              disabled={disabled || manual.trim().length === 0}
              className="h-12"
            >
              <Send className="h-4 w-4" aria-hidden />
              Gửi
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
