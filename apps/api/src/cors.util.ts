/**
 * Shared CORS allow-list for HTTP (Express) and Socket.IO.
 * Railway front (https://*.up.railway.app) must be allowed or the chat socket never connects.
 */
export function allowBrowserOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin) {
    callback(null, true);
    return;
  }
  const front = process.env.FRONTEND_URL?.replace(/\/$/, '');
  if (front && (origin === front || origin === `${front}/`)) {
    callback(null, true);
    return;
  }
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    callback(null, true);
    return;
  }
  try {
    if (new URL(origin).hostname.endsWith('.up.railway.app')) {
      callback(null, true);
      return;
    }
  } catch {
    /* ignore */
  }
  callback(null, false);
}
