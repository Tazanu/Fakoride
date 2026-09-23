/**
 * Talking to the API from the console.
 *
 * Same contract as the apps: failures carry a `code` and a screen chooses its
 * own words. Two things differ because this runs in a browser rather than on a
 * handset.
 *
 * The token is kept in `sessionStorage`, not `localStorage`. This is an ops
 * console on a desk that other people walk past, and a token that dies with the
 * tab is the right trade — an admin signs in once a shift, not once a month.
 *
 * Requests go to `/api`, which Vite proxies to the API in development. That
 * keeps everything same-origin: no CORS preflight on every call, and no second
 * place to configure an allowed origin.
 */

const TOKEN_KEY = "fako.ops.token";

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
    return new ApiError("offline", "Could not reach the API.", 0, true);
  }
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // A browser with storage blocked still works for this session; the token
    // simply lives in memory until the page is reloaded.
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  anonymous?: boolean;
};

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, anonymous = false } = options;
  const token = anonymous ? null : getToken();

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw ApiError.offline();
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
    throw new ApiError(
      err?.code ?? `http_${res.status}`,
      err?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
};

// --- shapes, mirroring what the API returns ---------------------------------

export type DriverStatus = "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED" | "REJECTED";

export type QueueDriver = {
  id: string;
  name: string | null;
  phone: string;
  plate: string;
  vehicleType: "MOTO" | "CAR";
  homeZone: string | null;
  appliedAt: string;
  waitingDays: number;
  documentsHeld: number;
  documentsRequired: number;
  hasDocuments: boolean;
};

export type DocumentKind = "NATIONAL_ID" | "VEHICLE_REGISTRATION" | "DRIVER_PHOTO";

export type DocumentRow = {
  kind: DocumentKind;
  uploadedAt: string;
  byteSize: number;
  contentType: string;
};

export type TripStatus =
  | "LIVE"
  | "REQUESTED"
  | "OFFERED"
  | "ACCEPTED"
  | "ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED_BY_RIDER"
  | "CANCELLED_BY_DRIVER"
  | "NO_DRIVER_FOUND";

export type TripRow = {
  id: string;
  status: Exclude<TripStatus, "LIVE">;
  priceXaf: number;
  paymentMethod: string;
  from: string;
  to: string;
  rider: string | null;
  riderPhone: string;
  driver: string | null;
  plate: string | null;
  requestedAt: string;
  /** Null once a driver has it, or once the trip is over. */
  waitingSeconds: number | null;
};

export type SosAlert = {
  id: string;
  tripId: string;
  status: "RAISED" | "ACKNOWLEDGED";
  raisedByRole: string;
  raisedByName: string | null;
  raisedByPhone: string;
  lat: number | null;
  lng: number | null;
  note: string | null;
  raisedAt: string;
  minutesOpen: number;
  tripStatus: string;
  route: string;
  driverName: string | null;
  driverPhone: string | null;
  plate: string | null;
};

export type ComplaintStatus = "OPEN" | "ANSWERED" | "CLOSED";

export type Complaint = {
  id: string;
  category: string;
  message: string;
  from: string | null;
  phone: string;
  tripId: string | null;
  route: string | null;
  priceXaf: number | null;
  plate: string | null;
  createdAt: string;
  respondBy: string;
  overdue: boolean;
};

export type Fare = {
  from: string;
  to: string;
  vehicleType: "MOTO" | "CAR";
  priceXaf: number;
  source: "FORMULA" | "FIELD";
  note: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

export type NoticeSeverity = "INFO" | "WARNING" | "SERVICE_SUSPENDED";

export type Notice = {
  id: string;
  message: string;
  messageFr: string;
  severity: NoticeSeverity;
  zone: string | null;
  activeFrom: string;
  activeUntil: string | null;
  /** Whether the apps are showing this one right now. */
  live: boolean;
};

export type Zone = { code: string; name: string; town: string };

export const ops = {
  signIn: {
    requestCode: (phone: string) =>
      request<{ sent: true; devCode?: string }>("/auth/otp/request", {
        method: "POST",
        body: { phone },
        anonymous: true,
      }),
    verify: (phone: string, code: string) =>
      request<{ token: string; user: { id: string; name: string | null; role: string } }>(
        "/auth/otp/verify",
        { method: "POST", body: { phone, code }, anonymous: true },
      ),
  },

  drivers: (status: DriverStatus) =>
    api.get<{ status: DriverStatus; waiting: number; drivers: QueueDriver[] }>(
      `/admin/drivers?status=${status}`,
    ),

  documents: (driverId: string) =>
    api.get<{ required: DocumentKind[]; held: number; complete: boolean; documents: DocumentRow[] }>(
      `/admin/drivers/${driverId}/documents`,
    ),

  /**
   * The URL an <img> points at for one document.
   *
   * The proxy sends the cookie-less request through, but the API wants a bearer
   * token — which an <img> cannot send. So the image is fetched with `request`
   * and turned into a blob URL by the caller rather than linked directly.
   */
  documentPath: (driverId: string, kind: DocumentKind) =>
    `/api/admin/drivers/${driverId}/documents/${kind.toLowerCase()}`,

  trips: (status: TripStatus) => api.get<{ trips: TripRow[] }>(`/admin/trips?status=${status}`),

  /**
   * The banner both apps show at the top of the home screen.
   *
   * `messageFr` is not optional — the API refuses a notice without it. Both
   * apps run in both languages and a French speaker must not be handed
   * English, least of all when the message is "no taxis are running today".
   */
  notices: () => api.get<{ notices: Notice[] }>("/admin/notices"),

  postNotice: (body: {
    message: string;
    messageFr: string;
    severity: NoticeSeverity;
    zone?: string;
  }) => api.post<{ id: string; severity: NoticeSeverity }>("/admin/notices", body),

  removeNotice: (id: string) => request<void>(`/admin/notices/${id}`, { method: "DELETE" }),

  sos: () => api.get<{ open: number; alerts: SosAlert[] }>("/admin/sos"),

  resolveSos: (id: string, status: "ACKNOWLEDGED" | "RESOLVED" | "FALSE_ALARM", outcome?: string) =>
    api.post<{ id: string; status: string }>(`/admin/sos/${id}/resolve`, {
      status,
      ...(outcome ? { outcome } : {}),
    }),

  complaints: (status: ComplaintStatus) =>
    api.get<{ status: ComplaintStatus; overdue: number; complaints: Complaint[] }>(
      `/admin/complaints?status=${status}`,
    ),

  respond: (id: string, response: string, close: boolean) =>
    api.post<{ id: string; status: ComplaintStatus; withinPromise: boolean }>(
      `/admin/complaints/${id}/respond`,
      { response, close },
    ),

  /**
   * Every zone, for the fare form.
   *
   * Not an admin route — this is the same list both apps use to name a place,
   * and the fare table has to offer pairs that do not exist in it yet.
   */
  zones: () => api.get<{ zones: Zone[] }>("/geo/zones"),

  fares: (source?: "FORMULA" | "FIELD") =>
    api.get<{ stillProvisional: number; pricedByHand: number; fares: Fare[] }>(
      `/admin/fares${source ? `?source=${source}` : ""}`,
    ),

  setFare: (from: string, to: string, priceXaf: number, note?: string) =>
    api.put<{ from: string; to: string; priceXaf: number; source: "FIELD" }>("/admin/fares", {
      from,
      to,
      vehicleType: "CAR",
      priceXaf,
      ...(note ? { note } : {}),
    }),

  suspend: (driverId: string, reason: string) =>
    api.post<{ id: string; status: DriverStatus }>(`/admin/drivers/${driverId}/suspend`, { reason }),

  reinstate: (driverId: string, note?: string) =>
    api.post<{ id: string; status: DriverStatus }>(`/admin/drivers/${driverId}/reinstate`, {
      ...(note ? { note } : {}),
    }),

  /**
   * Approve a driver.
   *
   * `overrideMissingDocuments` is refused by the API unless a note comes with
   * it, so the screen must collect one rather than sending the flag on its own.
   */
  verify: (
    driverId: string,
    licenceNumber: string,
    note?: string,
    overrideMissingDocuments = false,
  ) =>
    api.post<{ id: string; status: DriverStatus }>(`/admin/drivers/${driverId}/verify`, {
      licenceNumber,
      ...(note ? { note } : {}),
      ...(overrideMissingDocuments ? { overrideMissingDocuments: true } : {}),
    }),

  reject: (driverId: string, reason: string) =>
    api.post<{ id: string; status: DriverStatus }>(`/admin/drivers/${driverId}/reject`, { reason }),
};

/**
 * Fetch a document as a blob URL an <img> can show.
 *
 * `<img src>` cannot carry an Authorization header, and these are ID cards, so
 * the alternative — making them readable without one — is not an alternative.
 * The caller revokes the URL when it is done.
 */
export async function fetchDocumentUrl(driverId: string, kind: DocumentKind): Promise<string> {
  const token = getToken();
  const res = await fetch(ops.documentPath(driverId, kind), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new ApiError("no_document", "That document could not be loaded.", res.status);
  }
  return URL.createObjectURL(await res.blob());
}
