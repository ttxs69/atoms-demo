/**
 * Turnstile (ticket 05): invisible CAPTCHA on the entry points.
 *
 * Port-injected: production calls Cloudflare siteverify; tests inject a
 * constant-true fake. Absent keys (local dev) the widget stays dormant and
 * verification passes — the seam exists from day one, keys are a human step.
 */
export interface CaptchaPort {
  verify(token: string): Promise<boolean>;
}

export class TurnstileCaptcha implements CaptchaPort {
  readonly #secret: string;

  constructor(secret: string) {
    this.#secret = secret;
  }

  async verify(token: string): Promise<boolean> {
    const body = new URLSearchParams({
      secret: this.#secret,
      response: token,
    });
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
      });
      const data = (await res.json()) as { success?: boolean };
      return data.success === true;
    } catch {
      // Fail CLOSED: a broken verification backend must not become an open door.
      return false;
    }
  }
}

export class AllowAllCaptcha implements CaptchaPort {
  async verify(_token: string): Promise<boolean> {
    return true;
  }
}

export function captchaFromEnv(): CaptchaPort {
  const secret = process.env['TURNSTILE_SECRET_KEY'];
  return secret ? new TurnstileCaptcha(secret) : new AllowAllCaptcha();
}
