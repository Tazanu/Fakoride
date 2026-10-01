/**
 * Uploading and reading driver documents.
 *
 * Three routes and a deliberate asymmetry: a driver may write his own documents
 * and see *that* they exist, but he cannot read them back. Ops can read them
 * and cannot write them. Nobody else can do either.
 *
 * Uploads are a raw body rather than multipart. There is one file per request
 * and its kind is in the path, so a multipart parser would be a dependency
 * earning nothing — and every megabyte of parser is a megabyte of attack
 * surface in front of a store holding ID cards.
 *
 * Re-uploading a kind replaces it. A driver who reshoots a blurry photo should
 * not leave the blurry one behind for ops to guess between.
 */

import { Router, raw } from "express";
import { z } from "zod";
import { DocumentKind } from "@prisma/client";
import { env } from "../../env";
import { prisma } from "../../lib/prisma";
import { ApiError, asyncHandler, param } from "../../lib/http";
import { logger } from "../../lib/logger";
import { requireAuth } from "../../middleware/auth";
import { rateLimit, RULES } from "../../middleware/rateLimit";
import { assertAcceptable, documents, fingerprint } from "./store";

/** Every kind a driver must supply before anybody is dispatched to him. */
export const REQUIRED_KINDS: DocumentKind[] = [
  "NATIONAL_ID",
  "VEHICLE_REGISTRATION",
  "DRIVER_PHOTO",
];

const kindSchema = z.nativeEnum(DocumentKind);

/** Parses `:kind` from a path into the enum, or refuses. */
function readKind(value: string): DocumentKind {
  const parsed = kindSchema.safeParse(value.toUpperCase());
  if (!parsed.success) throw new ApiError(400, "bad_kind", "That is not a document we ask for.");
  return parsed.data;
}

/** Mounted at /drivers/me/documents. */
export function driverDocumentsRouter(): Router {
  const router = Router();

  /**
   * What he has sent so far.
   *
   * Deliberately no key and no bytes: he does not need to read his own ID card
   * back out of us, and not returning it means a stolen driver token cannot be
   * used to harvest identity documents.
   */
  router.get(
    "/",
    requireAuth("DRIVER"),
    asyncHandler(async (req, res) => {
      const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub } });
      if (!driver) throw new ApiError(404, "no_driver", "You have not applied yet.");

      const held = await prisma.driverDocument.findMany({
        where: { driverId: driver.id },
        select: { kind: true, uploadedAt: true, byteSize: true },
      });

      res.json({
        required: REQUIRED_KINDS,
        documents: REQUIRED_KINDS.map((kind) => {
          const one = held.find((h) => h.kind === kind);
          return {
            kind,
            uploaded: Boolean(one),
            uploadedAt: one?.uploadedAt ?? null,
            byteSize: one?.byteSize ?? null,
          };
        }),
        complete: REQUIRED_KINDS.every((k) => held.some((h) => h.kind === k)),
      });
    }),
  );

  /**
   * Send one photograph.
   *
   * `express.raw` with an explicit limit is what stops a large body being read
   * into memory at all — the size check below is the second line, not the first.
   */
  router.put(
    "/:kind",
    requireAuth("DRIVER"),
    // Before the body is read: an over-limit upload is refused without the
    // server taking in six megabytes first.
    rateLimit(RULES.uploads),
    raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: env.DOCUMENT_MAX_BYTES }),
    asyncHandler(async (req, res) => {
      const kind = readKind(param(req, "kind"));

      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      // Trust the bytes, not the header: `assertAcceptable` sniffs the magic
      // numbers and returns what the file really is.
      const contentType = assertAcceptable(bytes);

      const driver = await prisma.driver.findUnique({ where: { userId: req.user!.sub } });
      if (!driver) throw new ApiError(404, "no_driver", "Apply first, then send your documents.");
      if (driver.status === "SUSPENDED" || driver.status === "REJECTED") {
        throw new ApiError(409, "not_open", "This application is closed. Call us.");
      }

      const key = await documents.put(bytes, contentType);

      // Replace rather than accumulate, and delete the old object afterwards so
      // a failed write never leaves the row pointing at nothing.
      const previous = await prisma.driverDocument.findUnique({
        where: { driverId_kind: { driverId: driver.id, kind } },
        select: { key: true },
      });

      await prisma.driverDocument.upsert({
        where: { driverId_kind: { driverId: driver.id, kind } },
        create: { driverId: driver.id, kind, key, contentType, byteSize: bytes.length },
        update: { key, contentType, byteSize: bytes.length, uploadedAt: new Date() },
      });

      if (previous?.key && previous.key !== key) await documents.remove(previous.key);

      // The fingerprint, never the file: enough to prove a re-upload changed
      // something, and useless to anybody reading logs.
      logger.info(
        { driverId: driver.id, kind, bytes: bytes.length, sha: fingerprint(bytes) },
        "driver document received",
      );

      const held = await prisma.driverDocument.count({ where: { driverId: driver.id } });
      res.status(201).json({
        kind,
        uploaded: true,
        complete: held >= REQUIRED_KINDS.length,
      });
    }),
  );

  return router;
}

/** Mounted at /admin/drivers/:id/documents. */
export function adminDocumentsRouter(): Router {
  const router = Router({ mergeParams: true });

  /** What this driver has sent, for the approvals queue. */
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const driverId = param(req, "id");
      const held = await prisma.driverDocument.findMany({
        where: { driverId },
        select: { kind: true, uploadedAt: true, byteSize: true, contentType: true },
        orderBy: { uploadedAt: "asc" },
      });
      res.json({
        required: REQUIRED_KINDS,
        held: held.length,
        complete: REQUIRED_KINDS.every((k) => held.some((h) => h.kind === k)),
        documents: held,
      });
    }),
  );

  /**
   * The photograph itself, streamed to an authenticated ops session.
   *
   * The only route in the product that returns one of these. `no-store` because
   * an ID card in a proxy cache is an ID card we no longer control.
   */
  router.get(
    "/:kind",
    asyncHandler(async (req, res) => {
      const driverId = param(req, "id");
      const kind = readKind(param(req, "kind"));

      const one = await prisma.driverDocument.findUnique({
        where: { driverId_kind: { driverId, kind } },
      });
      if (!one) throw new ApiError(404, "no_document", "That document has not been sent.");

      const { bytes, contentType } = await documents.get(one.key);

      logger.info({ driverId, kind, by: req.user!.sub }, "ops viewed a driver document");

      res.setHeader("content-type", contentType);
      res.setHeader("cache-control", "no-store, private");
      res.setHeader("content-disposition", `inline; filename="${kind.toLowerCase()}"`);
      res.send(bytes);
    }),
  );

  return router;
}
