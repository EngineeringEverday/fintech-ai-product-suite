// Safe localStorage wrapper with in-memory fallback.
// Required: user explicitly requested localStorage persistence. Sandboxed iframes
// (and Safari private mode) can throw on access, so we never crash — we fall back
// to an in-memory Map for the lifetime of the page.

const memory = new Map<string, string>();

function available(): boolean {
  try {
    const k = '__id_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

let _available: boolean | null = null;
function isAvailable() {
  if (_available === null) _available = typeof window !== 'undefined' && available();
  return _available;
}

export const safeStorage = {
  get(key: string): string | null {
    try {
      if (isAvailable()) return window.localStorage.getItem(key);
    } catch {
      /* fallthrough */
    }
    return memory.has(key) ? memory.get(key)! : null;
  },
  set(key: string, value: string): void {
    try {
      if (isAvailable()) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      /* fallthrough */
    }
    memory.set(key, value);
  },
  remove(key: string): void {
    try {
      if (isAvailable()) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      /* fallthrough */
    }
    memory.delete(key);
  },
  isPersistent(): boolean {
    return isAvailable();
  },
};

export function getJSON<T>(key: string, fallback: T): T {
  const raw = safeStorage.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJSON<T>(key: string, value: T): void {
  try {
    safeStorage.set(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}
