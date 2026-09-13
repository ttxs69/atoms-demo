/**
 * Client-side Turnstile token acquisition (ticket 05's missing half).
 *
 * The server-side CaptchaPort existed from day one but nothing ever SENT a
 * token — the gate was decorative. This module loads Cloudflare's widget
 * script, renders it invisibly, and resolves a token. Without a site key
 * (local dev) it resolves null immediately; the server treats a missing
 * token as pass-through, so dev keeps working.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
        },
      ) => string;
    };
    __turnstileReady?: Promise<void>;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.__turnstileReady) return window.__turnstileReady;
  window.__turnstileReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile script failed to load'));
    document.head.appendChild(script);
  });
  return window.__turnstileReady;
}

let cachedToken: string | null = null;

/**
 * Get a Turnstile token (invisible widget — zero user friction). Resolves
 * null when no site key is configured (dev) or when anything goes wrong —
 * fail-open on the CLIENT, because the SERVER decides (fail-closed there
 * when a token IS present and invalid).
 */
export async function turnstileToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  if (cachedToken) return cachedToken;

  try {
    await loadScript();
    if (!window.turnstile) return null;
    return await new Promise<string | null>((resolve) => {
      const host = document.createElement('div');
      host.style.display = 'none';
      document.body.appendChild(host);
      const timeout = setTimeout(() => {
        host.remove();
        resolve(null);
      }, 10_000);
      window.turnstile!.render(host, {
        sitekey: siteKey,
        callback: (token) => {
          clearTimeout(timeout);
          cachedToken = token;
          resolve(token);
        },
        'error-callback': () => {
          clearTimeout(timeout);
          host.remove();
          resolve(null);
        },
      });
    });
  } catch {
    return null;
  }
}
