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

import { api } from "./client";

export type DriverStatus = "PENDING_REVIEW" | "ACTIVE" | "SUSPENDED" | "REJECTED";

export type Driver = {
  id: string;
  status: DriverStatus;
  vehicleType: "MOTO" | "CAR";
  plate: string;
  online: boolean;
  rating: number;
  tripCount: number;
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

  me: () => api.get<Me>("/auth/me"),
};

export const profile = {
  /** Correct a name typed wrong on a bus, or switch language. */
  update: (body: { name?: string; language?: "en" | "fr" }) =>
    api.patch<{ id: string; name: string | null; language: string }>("/me", body),

  removePhoto: () => api.delete<{ removed: true }>("/me/photo"),
};

/** The phone to wake when the app is not open. See notifications/push.ts. */
export const pushToken = {
  register: (token: string) => api.put<{ registered: true }>("/me/push-token", { token }),
  unregister: () => api.delete<null>("/me/push-token"),
};
