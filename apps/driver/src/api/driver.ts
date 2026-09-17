/**
 * Every call this app makes, typed.
 *
 * The shapes mirror what the API actually returns — they are not a guess. If a
 * field moves, this file is where the compiler tells you, rather than a screen
 * rendering `undefined` in front of a driver on the roadside.
 */

import { api } from "./client";

// --- shared shapes ----------------------------------------------------------

export type DriverStatus = "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED" | "REJECTED";
export type PaymentMethod = "CASH" | "MOMO" | "ORANGE_MONEY";
export type TripStatus =
  | "REQUESTED"
  | "OFFERED"
  | "ACCEPTED"
  | "ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED_BY_RIDER"
  | "CANCELLED_BY_DRIVER"
  | "NO_DRIVER_FOUND";

export type Me = {
  id: string;
  phone: string;
  name: string | null;
  role: "RIDER" | "DRIVER" | "ADMIN";
  language: string;
  driver: {
    id: string;
    status: DriverStatus;
    vehicleType: "MOTO" | "CAR";
    plate: string;
    online: boolean;
    rating: number;
    tripCount: number;
  } | null;
};

// --- signing in -------------------------------------------------------------

export const auth = {
  requestCode: (phone: string) =>
    api.post<{ sent: true; expiresInSeconds: number }>("/auth/otp/request", { phone }, { anonymous: true }),

  verifyCode: (params: { phone: string; code: string; name?: string }) =>
    api.post<{ token: string; user: Me }>(
      "/auth/otp/verify",
      { ...params, role: "DRIVER" },
      { anonymous: true },
    ),

  me: () => api.get<Me>("/auth/me"),
};

// --- becoming a driver ------------------------------------------------------

export const onboarding = {
  apply: (body: {
    name: string;
    plate: string;
    cniNumber: string;
    homeZone?: string;
    gender?: "UNSPECIFIED" | "WOMAN" | "MAN";
    hasSpareHelmet?: boolean;
  }) => api.post<{ id: string; status: DriverStatus; next: string }>("/drivers/apply", body),

  updateProfile: (body: { gender?: "UNSPECIFIED" | "WOMAN" | "MAN"; hasSpareHelmet?: boolean; homeZone?: string }) =>
    api.patch<{ gender: string; hasSpareHelmet: boolean; homeZoneId: string | null }>("/drivers/me", body),
};

// --- being on the road ------------------------------------------------------

export type TodaySummary = {
  date: string;
  tripCount: number;
  earnedXaf: number;
  /** Always zero. Rendered anyway — it is the entire pitch. */
  commissionXaf: 0;
  accessFee: { amountXaf: number; paid: boolean } | null;
  keptXaf: number;
};

export type ZoneDemand = {
  zone: string;
  name: string;
  pickupPoint: string | null;
  waitingRiders: number;
  bikesNearby: number;
  level: "QUIET" | "STEADY" | "BUSY";
};

export const shift = {
  goOnline: (lat: number, lng: number) =>
    api.post<{ online: true; zone: { code: string; name: string } }>("/drivers/online", { lat, lng }),

  goOffline: () => api.post<{ online: false }>("/drivers/offline"),

  /** The fallback. In normal operation position rides the socket instead. */
  pushPosition: (lat: number, lng: number) => api.post<{ ok: true }>("/drivers/position", { lat, lng }),

  today: () => api.get<TodaySummary>("/drivers/me/today"),

  demand: () => api.get<{ windowMinutes: number; zones: ZoneDemand[] }>("/demand/zones"),
};

// --- a trip -----------------------------------------------------------------

/** What arrives on the socket when a trip is offered. Twelve seconds to answer. */
export type TripOffer = {
  tripId: string;
  priceXaf: number;
  pickupLabel: string;
  dropLabel: string;
  pickupDistanceM: number;
  paymentMethod: PaymentMethod;
  needsHelmet: boolean;
  expiresInSeconds: number;
};

export type TripDetail = {
  id: string;
  status: TripStatus;
  priceXaf: number;
  paymentMethod: PaymentMethod;
  pickupLabel: string;
  dropLabel: string;
  from: { code: string; name: string };
  to: { code: string; name: string };
  /** Never present for a driver. He types what the rider reads out. */
  pin?: undefined;
  needsHelmet: boolean;
  womanDriverOnly: boolean;
  requestedAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export const trips = {
  get: (id: string) => api.get<TripDetail>(`/trips/${id}`),

  list: (limit = 20) => api.get<{ trips: unknown[]; nextBefore: string | null }>(`/trips?limit=${limit}`),

  accept: (id: string) =>
    api.post<{ status: "ACCEPTED"; pickupLabel: string; priceXaf: number }>(`/trips/${id}/accept`),

  /** "Leave it" — not a cancellation, because nothing was agreed yet. */
  decline: (id: string) => api.post<{ declined: true; passedOn: boolean }>(`/trips/${id}/decline`),

  arrived: (id: string) => api.post<{ status: "ARRIVED" }>(`/trips/${id}/arrived`),

  /** The PIN gate. Wrong code, no trip — and no fare dispute either. */
  start: (id: string, pin: string) => api.post<{ status: "IN_PROGRESS" }>(`/trips/${id}/start`, { pin }),

  complete: (id: string) =>
    api.post<{
      status: "COMPLETED";
      priceXaf: number;
      paymentMethod: PaymentMethod;
      payment: { id: string; status: string } | null;
    }>(`/trips/${id}/complete`),

  cancel: (id: string, reason?: string) =>
    api.post<{ status: string; requeued?: boolean }>(`/trips/${id}/cancel`, { reason }),

  sos: (id: string, body: { lat?: number; lng?: number; note?: string }) =>
    api.post<{ alertId: string; status: string; next: string }>(`/trips/${id}/sos`, body),
};

// --- money ------------------------------------------------------------------

export type EarningsDay = {
  date: string;
  weekday: string;
  earnedXaf: number;
  tripCount: number;
  feeXaf: number;
  worked: boolean;
  /** A Monday he did not work. Named, so a missing bar reads as a choice. */
  ghostTown: boolean;
};

export type WeekEarnings = {
  from: string;
  to: string;
  days: EarningsDay[];
  earnedXaf: number;
  feesXaf: number;
  keptXaf: number;
  tripCount: number;
  daysWorked: number;
  feesPaidCount: number;
};

export type Balance = {
  payableXaf: number;
  heldXaf: number;
  paidOutXaf: number;
  note: string;
  unpaidFees: { date: string; amountXaf: number; lastFailure: string | null }[];
  unpaidFeesXaf: number;
};

export const money = {
  week: () => api.get<WeekEarnings>("/drivers/me/week"),

  earnings: (days = 7) => api.get<unknown>(`/drivers/me/earnings?days=${days}`),

  /** Only ever mobile fares. Cash was handed to him and was never ours. */
  balance: () => api.get<Balance>("/drivers/me/balance"),

  cashOut: (amountXaf?: number) =>
    api.post<{ id: string; amountXaf: number; status: string; next: string; failureReason: string | null }>(
      "/drivers/me/cashout",
      amountXaf ? { amountXaf } : {},
    ),

  payments: () =>
    api.get<{
      payments: {
        id: string;
        purpose: string;
        status: string;
        amountXaf: number;
        createdAt: string;
        confirmedAt: string | null;
        failureReason: string | null;
      }[];
    }>("/drivers/me/payments"),
};

// --- where we are -----------------------------------------------------------

export const geo = {
  zones: () =>
    api.get<{ zones: { code: string; name: string; town: string; elevationM: number }[] }>("/geo/zones", {
      anonymous: true,
    }),

  resolve: (lat: number, lng: number) =>
    api.get<{
      zone: { code: string; name: string };
      label: string;
      nearestLandmark: { name: string; distanceKm: number } | null;
    }>(`/geo/resolve?lat=${lat}&lng=${lng}`, { anonymous: true }),

  notices: () =>
    api.get<{
      notices: { message: string; messageFr: string | null; severity: string; zone: string | null }[];
    }>("/geo/notices", { anonymous: true }),
};
