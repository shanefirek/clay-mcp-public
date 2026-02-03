/**
 * Clay Session Cookie Authentication
 *
 * Clay's internal API uses session-based auth via cookies.
 * The session cookie (claysession) must be obtained from browser DevTools.
 *
 * Cookie expiration: Sessions typically expire after a few hours/days of inactivity.
 * When API calls return 401, users need to refresh their cookie.
 */

export interface AuthConfig {
  sessionCookie: string;
}

export class ClayAuth {
  private sessionCookie: string;

  constructor(sessionCookie?: string) {
    const cookie = sessionCookie || process.env.CLAY_SESSION_COOKIE;

    if (!cookie) {
      throw new ClayAuthError(
        'CLAY_SESSION_COOKIE environment variable is required.\n\n' +
          'To get your session cookie:\n' +
          '1. Open Clay in Chrome\n' +
          '2. Go to Application > Cookies > app.clay.com\n' +
          '3. Copy the "claysession" cookie value\n' +
          '4. Set CLAY_SESSION_COOKIE=<your_cookie>'
      );
    }

    this.sessionCookie = cookie;
  }

  /**
   * Get headers required for Clay API requests
   */
  getHeaders(): Record<string, string> {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: 'https://app.clay.com',
      Cookie: `claysession=${this.sessionCookie}`,
    };
  }

  /**
   * Check if the session cookie appears valid (basic format check)
   */
  isValidFormat(): boolean {
    // Clay session cookies typically start with s%3A (URL-encoded s:)
    return (
      this.sessionCookie.startsWith('s%3A') ||
      this.sessionCookie.startsWith('s:')
    );
  }

  /**
   * Get masked cookie for logging (security)
   */
  getMaskedCookie(): string {
    if (this.sessionCookie.length <= 20) {
      return '***';
    }
    return `${this.sessionCookie.substring(0, 10)}...${this.sessionCookie.substring(this.sessionCookie.length - 5)}`;
  }
}

export class ClayAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClayAuthError';
  }
}

/**
 * Check if an error indicates session expiration
 */
export function isSessionExpiredError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('401') ||
      message.includes('unauthorized') ||
      message.includes('session expired') ||
      message.includes('authentication')
    );
  }
  return false;
}

/**
 * Format a helpful error message for session expiration
 */
export function formatSessionExpiredError(): string {
  return (
    'Session cookie has expired. Please refresh your cookie:\n\n' +
    '1. Open Clay in Chrome\n' +
    '2. Go to Application > Cookies > app.clay.com\n' +
    '3. Copy the new "claysession" cookie value\n' +
    '4. Update CLAY_SESSION_COOKIE in your config'
  );
}
