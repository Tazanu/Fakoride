/**
 * Realtime.
 *
 * Two rooms per person: `rider:<userId>` and `driver:<driverId>`. Offers, trip
 * state and driver positions ride the socket; nothing important depends on the
 * socket being up, because a taxi on the Soppo climb will lose signal.
 */

import type { Server as HttpServer } from "node:http";
import { Server as SocketServer, type Socket } from "socket.io";
import { env } from "./env";
import { prisma } from "./lib/prisma";
import { assertLive, verifyToken } from "./middleware/auth";
import { setDriverPosition } from "./lib/presence";
import { redis, driverActiveTripKey } from "./lib/redis";
import { logger } from "./lib/logger";

let io: SocketServer | null = null;

const riderRoom = (userId: string) => `rider:${userId}`;
const driverRoom = (driverId: string) => `driver:${driverId}`;
const tripRoom = (tripId: string) => `trip:${tripId}`;
/** Everyone on the ops console. SOS and complaints land here and nowhere else. */
const OPS_ROOM = "ops";
const sessionRoom = (jti: string) => `session:${jti}`;

type SocketState = { userId: string; role: string; driverId?: string; vehicleType?: string; jti?: string };
const state = new WeakMap<Socket, SocketState>();

export function initRealtime(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    // The same rule as the HTTP side. The app speaks websocket, which a
    // browser does not hold to CORS — but every socket still needs a token.
    cors: { origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false },
    // Cheap keepalives: the driver's data bundle is money out of his pocket.
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as string | undefined;
      if (!token) throw new Error("missing token");
      const claims = verifyToken(token);
      // A signed-out session must not be able to open a live feed either.
      await assertLive(claims);

      const s: SocketState = { userId: claims.sub, role: claims.role, ...(claims.jti ? { jti: claims.jti } : {}) };
      if (claims.role === "DRIVER") {
        const driver = await prisma.driver.findUnique({ where: { userId: claims.sub } });
        if (driver) {
          s.driverId = driver.id;
          s.vehicleType = driver.vehicleType;
        }
      }
      state.set(socket, s);
      next();
    } catch {
      next(new Error("unauthorised"));
    }
  });

  io.on("connection", (socket) => {
    const s = state.get(socket);
    if (!s) {
      socket.disconnect(true);
      return;
    }

    socket.join(riderRoom(s.userId));
    // Its own session's room, so signing out can close exactly this connection.
    if (s.jti) socket.join(sessionRoom(s.jti));
    if (s.driverId) socket.join(driverRoom(s.driverId));
    if (s.role === "ADMIN") socket.join(OPS_ROOM);

    /** The normal position channel. The REST endpoint is only a fallback. */
    socket.on("driver:position", async (payload: { lat?: number; lng?: number }) => {
      if (!s.driverId || !s.vehicleType) return;
      if (typeof payload?.lat !== "number" || typeof payload?.lng !== "number") return;
      await setDriverPosition(s.driverId, s.vehicleType, payload.lat, payload.lng);

      // Push it to whoever is watching this trip — the rider's map, and the
      // person holding the share link. Redis rather than Postgres because this
      // runs every few seconds for every driver on the road.
      const tripId = await redis.get(driverActiveTripKey(s.driverId));
      if (tripId) emitToTrip(tripId, "trip:position", { lat: payload.lat, lng: payload.lng });
    });

    /**
     * Watch one trip: the live map, and the share link's socket.
     *
     * Checked against the trip, not merely against having a token. Without this
     * any signed-in account could join `trip:<id>` for a guessable id and follow
     * a stranger's position across Buea.
     */
    socket.on("trip:watch", async (payload: { tripId?: string }) => {
      if (typeof payload?.tripId !== "string") return;
      const trip = await prisma.trip.findUnique({
        where: { id: payload.tripId },
        select: { riderId: true, driverId: true },
      });
      if (!trip) return;
      const mayWatch =
        trip.riderId === s.userId || (s.driverId !== undefined && trip.driverId === s.driverId) || s.role === "ADMIN";
      if (!mayWatch) {
        logger.warn({ userId: s.userId, tripId: payload.tripId }, "refused trip:watch for a trip that is not theirs");
        return;
      }
      socket.join(tripRoom(payload.tripId));
    });

    socket.on("disconnect", (reason) => {
      // Deliberately NOT marking the driver offline: losing signal is normal here
      // and must not drop him out of dispatch. Only /drivers/offline does that.
      logger.debug({ userId: s.userId, reason }, "socket disconnected");
    });
  });

  return io;
}

export function emitToDriver(driverId: string, event: string, payload: unknown): void {
  io?.to(driverRoom(driverId)).emit(event, payload);
}

/** Close the live connections one signed-out session opened. */
export function endSession(jti: string): void {
  io?.in(sessionRoom(jti)).disconnectSockets(true);
}

/** Close every live connection an account has. Every socket joins its user's room. */
export function endAllSessions(userId: string): void {
  io?.in(riderRoom(userId)).disconnectSockets(true);
}

export function emitToRider(userId: string, event: string, payload: unknown): void {
  io?.to(riderRoom(userId)).emit(event, payload);
}

export function emitToTrip(tripId: string, event: string, payload: unknown): void {
  io?.to(tripRoom(tripId)).emit(event, payload);
}

/**
 * The ops console. SOS alerts and complaints go here and are never echoed to
 * the other side of the trip — a rider raising an alarm about the driver he is
 * sitting behind must not light up that driver's phone.
 */
export function emitToOps(event: string, payload: unknown): void {
  io?.to(OPS_ROOM).emit(event, payload);
}

export async function closeRealtime(): Promise<void> {
  await io?.close();
  io = null;
}
