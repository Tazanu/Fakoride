/**
 * Talking to the API.
 *
 * Three things this has to get right, all of them because of where the app runs:
 *
 *   1. A dropped connection is normal, not exceptional. A phone on the Soppo
 *      climb loses signal several times a trip. Every failure here is a value
 *      the caller can render, never an unhandled throw.
 *   2. Errors are matched on `code`, never on `message`. The API answers in
 *      English; the app runs in English and French. Showing a rider a server's
 *      English sentence is a bug, so the code is the contract and the wording
 *      is the app's business.
 *   3. Data costs money. Requests are small, and nothing polls that a socket
 *      could push.
 */

import Constants from "expo-constants";
import { deleteSecret, getSecret, setSecret } from "./storage";

/** Long enough for a bad 3G handshake, short enough that a driver is not stuck. */
const TIMEOUT_MS = 15_000;

const TOKEN_KEY = "fako.token";

/**
 * Where the API lives.
 *
 * In development a phone cannot reach `localhost` — that is the phone's own
 * loopback, not the laptop's. Expo knows the address the bundler is being
 * served from, so we borrow its host and swap the port. Set EXPO_PUBLIC_API_URL
 * to override, which is what a real build does.
 */
export function apiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(":")[0];
  if (host) return `http://${host}:4000`;

  // Android emulator's alias for the host machine. Better than a blank screen.
  return "http://10.0.2.2:4000";
}

/**
 * A failure the app can act on.
 *
 * `code` drives behaviour and `message` is only ever for a log. `offline` is
 * separated out because "we could not reach the server" and "the server said
 * no" call for completely different screens — one offers a retry, the other
 * explains something.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly offline = false,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static offline(): ApiError {
    return new ApiError("offline", "Could not reach Fako Ride.", 0, true);
  }
}

let memoryToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  memoryToken = await getSecret(TOKEN_KEY);
  return memoryToken;
}

export async function setToken(token: string): Promise<void> {
  memoryToken = token;
  await setSecret(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  memoryToken = null;
  await deleteSecret(TOKEN_KEY);
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header — sign-in and the public gazetteer. */
  anonymous?: boolean;
  signal?: AbortSignal;
};

/** Called when the API says the token is no longer good, so the app can sign out. */
let onUnauthorised: (() => void) | null = null;
export function setUnauthorisedHandler(fn: () => void): void {
  onUnauthorised = fn;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, anonymous = false, signal } = options;

  const token = anonymous ? null : await getToken();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);

  // Caller cancellation and our own timeout both have to reach the fetch.
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: timeout.signal,
    });
  } catch {
    // No status, no body — the request never landed. Distinct from a refusal.
    throw ApiError.offline();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    const code = err?.code ?? `http_${res.status}`;
    if (res.status === 401 && code !== "wrong_code" && code !== "code_expired") {
      // The token is gone or stale. A failed sign-in attempt is not that.
      onUnauthorised?.();
    }
    throw new ApiError(code, err?.message ?? `Request failed (${res.status})`, res.status);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
};

/**
 * A photograph, as something `<Image>` can render.
 *
 * `Image` cannot send an Authorization header, and none of these are public,
 * so the bytes are fetched here and handed over as a data URI. Small by
 * design — a face at 96 points — and never cached to disk, because the whole
 * point of serving them ourselves is that they do not lie around.
 *
 * Returns null rather than throwing when there is nothing to show: "no
 * photograph" is an ordinary state, not a failure.
 */
export async function fetchPhotoDataUri(path: string): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const type = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    // `btoa` is present in Hermes and on web; no Buffer polyfill needed.
    return `data:${type};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}
