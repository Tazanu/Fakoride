/**
 * Who is signed in, and how you sign in.
 *
 * One app, one account. A phone number is a person; whether that person also
 * drives is a record hanging off them, which is why `driver` is nullable here
 * rather than there being two kinds of user.
 *
 * The role sent at verification only applies when the account is created — the
 * API upserts on phone number and leaves an existing role alone. So everybody
 * starts as a rider, and `POST /drivers/apply` is the only thing that ever
 * makes somebody a driver.
 */

import { api, setToken } from "./client";

export type DriverStatus = "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED" | "REJECTED";

export type Driver = {
  id: string;
  status: DriverStatus;
  vehicleType: "MOTO" | "CAR";
  plate: string;
  online: boolean;
  rating: number;
  tripCount: number;
  /** What ops wrote when they suspended or turned him down. Null otherwise. */
  statusReason?: string | null;
};

export type Me = {
  id: string;
  phone: string;
  name: string | null;
  role: "RIDER" | "DRIVER" | "ADMIN";
  language: string;
  /**
   * Whether a photograph exists — never where it is.
   *
   * There is no URL to a face anywhere in this app. The bytes come from
   * `/me/photo` with a token attached, so a screenshot of a network log is not
   * a link somebody else can open.
   */
  hasPhoto: boolean;
  /** Null for everybody who has not applied to drive. */
  driver: Driver | null;
};

/** True when this person may open the driver side. */
export function drives(me: Me | null): boolean {
  return Boolean(me?.driver);
}

export const auth = {
  requestCode: (phone: string) =>
    api.post<{ sent: true; expiresInSeconds: number; devCode?: string }>(
      "/auth/otp/request",
      { phone },
      { anonymous: true },
    ),

  verifyCode: (params: { phone: string; code: string; name?: string }) =>
    api.post<{ token: string; user: Me }>(
      "/auth/otp/verify",
      // RIDER is the starting role for a new account and is ignored for one
      // that already exists, so a driver signing in is not demoted by it.
      { ...params, role: "RIDER" },
      { anonymous: true },
    ),

  /**
   * Who is signed in. When the server finds the token out of date about the
   * account's role it sends a replacement along, which is kept here so that no
   * screen has to know it happened.
   */
  me: () =>
    api.get<Me & { token?: string }>("/auth/me").then(async ({ token, ...me }) => {
      if (token) await setToken(token);
      return me as Me;
    }),

  /** End this session on the server, and forget this phone for push if it holds it. */
  signOut: (pushToken: string | null) =>
    api.post<null>("/auth/sign-out", pushToken ? { pushToken } : {}),

  /** End every session; this phone gets a fresh one back. */
  signOutEverywhere: () => api.post<{ token: string }>("/auth/sign-out-everywhere"),
};

export const profile = {
  /** Correct a name typed wrong on a bus, or switch language. */
  update: (body: { name?: string; language?: "en" | "fr" }) =>
    api.patch<{ id: string; name: string | null; language: string }>("/me", body),

  removePhoto: () => api.delete<{ removed: true }>("/me/photo"),

  /**
   * Delete this account, for good. Refused with `trip_in_progress`,
   * `money_held` or `payment_in_flight` when something has to finish first.
   * The server wants the word itself, so a stray request cannot do it.
   */
  deleteAccount: () => api.delete<{ deleted: true }>("/me", { body: { confirm: "DELETE" } }),
};

/** Where a finished ride's money stands. See fareState on the server. */
export type FareState = "NOT_DUE" | "CASH" | "WAITING" | "PAID" | "FAILED" | "PAID_IN_CASH";
export type Fare = { state: FareState; reason: string | null };

export type CurrentRide = { id: string; status: string; pickupLabel: string; dropLabel: string };

/** One line of "Your rides". */
export type RideSummary = {
  id: string;
  status: string;
  priceXaf: number;
  paymentMethod: "CASH" | "MOMO" | "ORANGE_MONEY";
  pickupLabel: string;
  dropLabel: string;
  requestedAt: string;
  completedAt: string | null;
  fare: Fare;
};

export const rides = {
  /** The ride this account is in the middle of — so closing the app does not lose it. */
  current: (side: "rider" | "driver") => api.get<{ trip: CurrentRide | null }>(`/trips/current?side=${side}`),
  /** Newest first. `before` is the cursor the last page handed back. */
  list: (before?: string) =>
    api.get<{ trips: RideSummary[]; nextBefore: string | null }>(
      `/trips?limit=20${before ? `&before=${encodeURIComponent(before)}` : ""}`,
    ),
};

export type SupportContacts = { phone: string | null; whatsapp: string | null; email: string };

/** How to reach a person. Public, and set on the server so it can change without an update. */
export const support = {
  get: () => api.get<SupportContacts>("/support", { anonymous: true }),
};

export type TrustedContact = { id: string; name: string; phone: string };

/** The people texted when Get help is pressed. See ui/trusted-contacts.tsx. */
export const contacts = {
  list: () => api.get<{ contacts: TrustedContact[]; max: number }>("/me/contacts"),
  add: (name: string, phone: string) => api.post<TrustedContact>("/me/contacts", { name, phone }),
  remove: (id: string) => api.delete<null>(`/me/contacts/${encodeURIComponent(id)}`),
};

/** The phone to wake when the app is not open. See notifications/push.ts. */
export const pushToken = {
  register: (token: string) => api.put<{ registered: true }>("/me/push-token", { token }),
};
