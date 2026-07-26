/** Thin wrapper over the Telegram WebApp SDK with a browser dev fallback. */

interface TgWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready(): void;
  expand(): void;
  openTelegramLink(url: string): void;
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
  MainButton?: { setText(t: string): void; show(): void; hide(): void; onClick(cb: () => void): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg = window.Telegram?.WebApp;

/** initData for API auth. In a browser (no Telegram) fall back to a demo uid. */
export function initData(): string {
  if (tg?.initData) return tg.initData;
  const params = new URLSearchParams(window.location.search);
  return `demo_uid=${params.get("uid") ?? "1"}`;
}

export function isTelegram(): boolean {
  return !!tg?.initData;
}

export function boot(): "light" | "dark" {
  if (!tg) return preferredScheme();
  tg.ready();
  tg.expand();
  applyTheme(tg);
  return tg.colorScheme ?? "light";
}

function preferredScheme(): "light" | "dark" {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Map Telegram theme params onto our CSS variables when present. */
function applyTheme(app: TgWebApp) {
  const p = app.themeParams ?? {};
  const root = document.documentElement;
  const map: Record<string, string> = {
    "--tg-bg": p.bg_color ?? "",
    "--tg-text": p.text_color ?? "",
    "--tg-hint": p.hint_color ?? "",
    "--tg-link": p.link_color ?? "",
    "--tg-button": p.button_color ?? "",
    "--tg-button-text": p.button_text_color ?? "",
    "--tg-secondary-bg": p.secondary_bg_color ?? "",
  };
  for (const [k, v] of Object.entries(map)) if (v) root.style.setProperty(k, v);
  root.dataset.scheme = app.colorScheme ?? "light";
}

export function haptic(kind: "light" | "success" | "warning" = "light") {
  try {
    if (kind === "light") tg?.HapticFeedback?.impactOccurred("light");
    else tg?.HapticFeedback?.notificationOccurred(kind);
  } catch {
    /* noop */
  }
}
