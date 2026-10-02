/**
 * Every call this app makes, typed.
 *
 * The shapes mirror what the API actually returns — they are not a guess. If a
 * field moves, this file is where the compiler tells you, rather than a screen
 * rendering `undefined` in front of somebody standing at a junction at night.
 */

import { api } from "./client";

// --- shared shapes ----------------------------------------------------------

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

// Who is signed in lives in one place now that one app serves both sides.
// Re-exported so a screen can keep importing it from the module it already uses.
export { auth } from "./session";
export type { Me, Driver, DriverStatus } from "./session";

/**
 * Telling us something went wrong.
 *
 * The API has carried this since the beginning and no screen ever called it,
 * so the ops console has been answering a queue nothing could fill. The
 * categories are the schema's own — sending anything else is refused.
 */
export type ComplaintCategory =
  | "FARE_DISPUTE"
  | "DRIVER_CONDUCT"
  | "SAFETY"
  | "LOST_ITEM"
  | "APP_PROBLEM"
  | "OTHER";

export type MyComplaint = {
  id: string;
  tripId: string | null;
  category: ComplaintCategory;
  message: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  createdAt: string;
  /** The day we promised an answer by. */
  respondBy: string;
  answeredAt: string | null;
  /** What a person wrote back. Null until somebody has. */
  response: string | null;
};

export const complaints = {
  file: (body: { category: ComplaintCategory; message: string; tripId?: string }) =>
    api.post<{ id: string; status: string; respondBy: string; next: string }>("/complaints", body),

  /**
   * What she told us, and what came back.
   *
   * The API has answered this from the beginning and no screen ever asked.
   * The end-of-trip form promised "a person reads this and answers you within
   * a day" — and the answer then had nowhere to land. Ops has been writing
   * replies into a void.
   */
  mine: () => api.get<{ complaints: MyComplaint[] }>("/complaints/mine"),
};

// --- where we are -----------------------------------------------------------

export type Zone = { code: string; name: string; town: string; elevationM: number };

export type Landmark = {
  name: string;
  zone: string;
  zoneName: string;
  lat: number;
  lng: number;
};

export type Resolved = {
  zone: { code: string; name: string };
  /** "Checkpoint" or "Mile 17 Motor Park, Mile 17" — already de-duplicated. */
  label: string;
  nearestLandmark: { name: string; distanceKm: number } | null;
};

export const geo = {
  zones: () => api.get<{ zones: Zone[] }>("/geo/zones", { anonymous: true }),

  /** Turns a GPS fix into the words a person would say. */
  resolve: (lat: number, lng: number) =>
    api.get<Resolved>(`/geo/resolve?lat=${lat}&lng=${lng}`, { anonymous: true }),

  /**
   * Find a place by what people call it.
   *
   * Matches landmark names *and their aliases*, which is the whole reason the
   * gazetteer exists: nobody here gives a street address, they say Checkpoint
   * or Mile 17 Motor Park. Searching the fourteen zone names instead offers
   * her "Molyko" when she typed the name of a junction inside it.
   */
  search: (q: string) =>
    api.get<{ results: Landmark[] }>(`/geo/search?q=${encodeURIComponent(q)}`, {
      anonymous: true,
    }),

  /** Road closures, fuel queues, a landslide on the Soppo climb. */
  notices: () =>
    api.get<{
      notices: { message: string; messageFr: string | null; severity: string; zone: string | null }[];
    }>("/geo/notices", { anonymous: true }),
};

// --- what it costs ----------------------------------------------------------

/**
 * The fare, before anybody is asked to drive anywhere.
 *
 * `priceXaf` is cash and `mobilePriceXaf` is the same trip paid by phone. The
 * difference is the whole reason the discount exists and it belongs on screen,
 * not buried: the rider is being paid to choose the cheaper rail for us.
 */
export type Quote = {
  /** Codes, not objects — the API answers with the pair it priced. */
  fromZoneCode: string;
  toZoneCode: string;
  vehicleType: "MOTO" | "CAR";
  priceXaf: number;
  mobilePriceXaf: number;
  hillFare: boolean;
  source: "FIELD" | "FORMULA";
};

/** One row of the price list from where she is standing. */
export type FareFrom = {
  code: string;
  name: string;
  priceXaf: number;
  mobilePriceXaf: number;
  hillFare: boolean;
  distanceKm: number;
  source: "FIELD" | "FORMULA";
};

export const fares = {
  quote: (params: { fromLat: number; fromLng: number; toZone: string }) =>
    api.get<Quote>(
      `/fares/quote?fromLat=${params.fromLat}&fromLng=${params.fromLng}&toZone=${encodeURIComponent(params.toZone)}`,
    ),

  /**
   * Every fare out of one zone, in one request.
   *
   * The endpoint's own comment says "this is the home screen", and for a long
   * time the home screen did not ask it: she saw a price for the places she
   * had been before and nothing at all for anywhere new. Anonymous, because
   * the price list is the argument for the app and should not need an account.
   */
  from: (zoneCode: string) =>
    api.get<{ from: { code: string; name: string }; destinations: FareFrom[] }>(
      `/fares/from/${encodeURIComponent(zoneCode)}`,
      { anonymous: true },
    ),
};

// --- how busy it is ---------------------------------------------------------

export const demand = {
  /** A count of taxis near a point, never their positions. */
  nearby: (lat: number, lng: number) =>
    api.get<{ driversNearby: number; nearestDriverM: number | null }>(
      `/demand/nearby?lat=${lat}&lng=${lng}`,
    ),
};

// --- the trip ---------------------------------------------------------------

export type TripDriver = {
  name: string | null;
  phone: string;
  plate: string;
  rating: number;
  tripCount: number;
  verified: boolean;
  hasSpareHelmet: boolean;
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
  /** Where those places are, for the map. Labels are for people. */
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  /**
   * Four digits, and only the rider ever sees them.
   *
   * She reads them out; he types what he is told. That direction is the whole
   * safety design — a driver who could see the PIN could start a trip with
   * somebody who never got in.
   */
  pin?: string;
  driver: TripDriver | null;
  needsHelmet: boolean;
  womanDriverOnly: boolean;
  requestedAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type Repeat = {
  zone: string;
  name: string;
  label: string;
  tripCount: number;
  priceXaf: number;
  mobilePriceXaf: number;
  hillFare: boolean;
};

export type BookRequest = {
  pickupLat: number;
  pickupLng: number;
  pickupLabel?: string;
  toZone: string;
  paymentMethod: PaymentMethod;
  needsHelmet?: boolean;
  womanDriverOnly?: boolean;
};

export const trips = {
  book: (body: BookRequest) =>
    api.post<{
      id: string;
      status: TripStatus;
      priceXaf: number;
      paymentMethod: PaymentMethod;
      pin: string;
      pickupLabel: string;
      dropLabel: string;
      hillFare: boolean;
      needsHelmet: boolean;
      womanDriverOnly: boolean;
    }>("/trips", body),

  get: (id: string) => api.get<TripDetail>(`/trips/${id}`),

  /** Her own history, newest first. Drives "go there again". */
  mine: (limit = 10) =>
    api.get<{ trips: TripDetail[]; nextBefore: string | null }>(`/trips?limit=${limit}`),

  /**
   * The trips she takes over and over, so booking one is a single tap.
   *
   * `label` is what she called the place last time, not what the gazetteer
   * calls it — the point of the row is recognition, not correctness.
   */
  repeats: (lat: number, lng: number) =>
    api.get<{
      from: { code: string; name: string };
      repeats: Repeat[];
    }>(`/trips/repeats?fromLat=${lat}&fromLng=${lng}`),

  cancel: (id: string, reason?: string) =>
    api.post<{ status: string }>(`/trips/${id}/cancel`, { reason }),

  rate: (id: string, stars: number, comment?: string) =>
    api.post<{ ok: true }>(`/trips/${id}/rate`, { stars, ...(comment ? { comment } : {}) }),

  /** Panic. Sends position with it, because "where" is the whole question. */
  sos: (id: string, body: { lat?: number; lng?: number; note?: string }) =>
    api.post<{ alertId: string; status: string; next: string; contactsTold: number }>(`/trips/${id}/sos`, body),
};

// --- letting somebody watch -------------------------------------------------

/**
 * A link her mother can open.
 *
 * Expires on its own — the API gives it six hours and half an hour of grace
 * after the trip ends. A share link that outlives the ride is a tracker.
 */
export type Share = {
  token: string;
  /** Relative — the app joins it to the API origin to make something sendable. */
  path: string;
  sharedWith: string | null;
  expiresAt: string;
};

export const share = {
  create: (tripId: string, sharedWith?: string) =>
    api.post<Share>(`/trips/${tripId}/share`, sharedWith ? { sharedWith } : {}),

  /** Who is watching, so the trip screen can say so by name. */
  list: (tripId: string) =>
    api.get<{
      shares: { token: string; sharedWith: string | null; viewCount: number; expiresAt: string }[];
    }>(`/trips/${tripId}/share`),

  /** Taking it back. The reason these are stored rather than signed. */
  revoke: (tripId: string, token: string) =>
    api.delete<{ revoked: true }>(`/trips/${tripId}/share/${token}`),
};
