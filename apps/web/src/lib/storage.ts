/**
 * Typed localStorage wrapper — namespace `iot:` + SSR-safe.
 *
 * - Không throw khi SSR (window undefined), trả default.
 * - Không throw khi storage full / Safari private mode, log warn + return default.
 * - Serializer JSON mặc định, override được cho payload lớn.
 */

const NAMESPACE = "iot:";

function safeWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

export interface StorageOptions<T> {
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
}

export const storage = {
  /** Lấy giá trị, trả default nếu chưa có hoặc parse lỗi. */
  get<T>(key: string, defaultValue: T, options: StorageOptions<T> = {}): T {
    const win = safeWindow();
    if (!win) return defaultValue;
    try {
      const raw = win.localStorage.getItem(NAMESPACE + key);
      if (raw === null) return defaultValue;
      const deserialize = options.deserialize ?? (JSON.parse as (s: string) => T);
      return deserialize(raw);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[storage.get] ${key}`, err);
      }
      return defaultValue;
    }
  },

  /** Ghi giá trị. Silent fail nếu storage quota đầy. */
  set<T>(key: string, value: T, options: StorageOptions<T> = {}): void {
    const win = safeWindow();
    if (!win) return;
    try {
      const serialize = options.serialize ?? (JSON.stringify as (v: T) => string);
      win.localStorage.setItem(NAMESPACE + key, serialize(value));
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[storage.set] ${key}`, err);
      }
    }
  },

  remove(key: string): void {
    const win = safeWindow();
    if (!win) return;
    try {
      win.localStorage.removeItem(NAMESPACE + key);
    } catch {
      /* noop */
    }
  },

  /** Xoá toàn bộ key trong namespace `iot:`. */
  clearNamespace(): void {
    const win = safeWindow();
    if (!win) return;
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < win.localStorage.length; i++) {
        const k = win.localStorage.key(i);
        if (k && k.startsWith(NAMESPACE)) toRemove.push(k);
      }
      toRemove.forEach((k) => win.localStorage.removeItem(k));
    } catch {
      /* noop */
    }
  },
};

/** Predefined key constants — tránh typo lan khắp code. */
export const STORAGE_KEYS = {
  sidebarCollapsed: "sidebar-collapsed",
  density: "items-density",
  cmdkRecents: "cmdk-recent",
  dashboardAutoRefresh: "dashboard:auto-refresh",
} as const;
