"use client";

import * as React from "react";

/**
 * Shortcut helpers — global hotkey registry.
 *
 * Quy ước chuẩn theo brainstorm-deep §6 + design-spec:
 * - Skip khi IME composing (Telex/VNI): `e.isComposing === true`.
 * - Skip khi user đang gõ trong input/textarea/contenteditable (trừ hotkey
 *   explicit allow-in-input).
 * - Detect macOS → dùng Meta (⌘) thay cho Ctrl cho 1 số combo (K).
 */

export interface HotkeyOptions {
  /** Cho phép trigger khi đang focus vào input/textarea. Default: false. */
  allowInInput?: boolean;
  /** preventDefault khi match. Default: true. */
  preventDefault?: boolean;
  /** Stop propagation. Default: false. */
  stopPropagation?: boolean;
  /** Disabled flag để tắt tạm thời. */
  enabled?: boolean;
}

/**
 * Parse chuỗi combo như "Ctrl+K", "Meta+K", "Mod+K" (Mod = Meta trên macOS,
 * Ctrl các OS khác), "Shift+/", "Escape", "/".
 */
interface ParsedCombo {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  useMod: boolean;
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.split("+").map((p) => p.trim());
  const key = parts[parts.length - 1]!.toLowerCase();
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
  return {
    key,
    ctrl: mods.includes("ctrl") || mods.includes("control"),
    meta: mods.includes("meta") || mods.includes("cmd") || mods.includes("command"),
    shift: mods.includes("shift"),
    alt: mods.includes("alt") || mods.includes("option"),
    useMod: mods.includes("mod"),
  };
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function matches(e: KeyboardEvent, combo: ParsedCombo): boolean {
  if (e.key.toLowerCase() !== combo.key) return false;
  const macLike = isMac();
  const wantCtrl = combo.useMod ? !macLike : combo.ctrl;
  const wantMeta = combo.useMod ? macLike : combo.meta;
  if (wantCtrl !== e.ctrlKey) return false;
  if (wantMeta !== e.metaKey) return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.alt !== e.altKey) return false;
  return true;
}

function isInEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * React hook — đăng ký 1 hotkey global ở cấp `window`.
 * Tự động dispose khi unmount.
 */
export function useHotkey(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  options: HotkeyOptions = {},
): void {
  const {
    allowInInput = false,
    preventDefault = true,
    stopPropagation = false,
    enabled = true,
  } = options;

  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const parsed = parseCombo(combo);

    const onKeyDown = (e: KeyboardEvent) => {
      // IME guard — khi đang compose Tiếng Việt (Telex/VNI) thì bỏ qua.
      if (e.isComposing || e.keyCode === 229) return;
      if (!allowInInput && isInEditable(e.target)) return;
      if (!matches(e, parsed)) return;
      if (preventDefault) e.preventDefault();
      if (stopPropagation) e.stopPropagation();
      handlerRef.current(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combo, allowInInput, preventDefault, stopPropagation, enabled]);
}

/**
 * Render-friendly hiển thị combo trên UI (OS-aware).
 * VD: "Mod+K" → "⌘K" trên Mac, "Ctrl+K" else.
 */
export function formatShortcut(combo: string): string {
  const parsed = parseCombo(combo);
  const mac = isMac();
  const mod = parsed.useMod ? (mac ? "⌘" : "Ctrl") : null;
  const parts: string[] = [];
  if (mod) parts.push(mod);
  if (parsed.ctrl && !parsed.useMod) parts.push("Ctrl");
  if (parsed.meta && !parsed.useMod) parts.push(mac ? "⌘" : "Meta");
  if (parsed.alt) parts.push(mac ? "⌥" : "Alt");
  if (parsed.shift) parts.push(mac ? "⇧" : "Shift");
  parts.push(parsed.key.toUpperCase());
  return mac ? parts.join("") : parts.join("+");
}
