/**
 * Stand up a driver application worth reviewing.
 *
 *   npm run seed:application
 *   npm run seed:application -- 672000155 "Ngwa Ferdinand"
 *
 * The ops console's whole job is looking at somebody's papers and deciding.
 * With an empty store there is nothing to look at, so the approvals screen can
 * only ever be seen in its "documents missing" state — the one path nobody
 * built it for. This fills the queue with an application that has all three.
 *
 * The images are drawn here, in code, out of rectangles. They are obviously not
 * documents: no photograph, no text, and a diagonal band across every one of
 * them. That is deliberate. A dev database holding things that *look* like real
 * national ID cards is a bad thing to have on a laptop, and a worse thing to
 * mistake for evidence that a real driver was checked.
 *
 * Development only — it refuses to run against any other NODE_ENV.
 */

import "dotenv/config";
import { deflateSync } from "node:zlib";
import { PrismaClient, type DocumentKind } from "@prisma/client";
import { normalisePhone } from "../src/lib/phone";
import { documents as store } from "../src/modules/documents/store";
import { env } from "../src/env";

const prisma = new PrismaClient();

// --- drawing ---------------------------------------------------------------

type RGB = [number, number, number];

/** A canvas of raw pixels, and the few shapes needed to suggest a document. */
class Canvas {
  private readonly px: Buffer;

  constructor(
    readonly width: number,
    readonly height: number,
    background: RGB,
  ) {
    this.px = Buffer.alloc(width * height * 3);
    this.fill(0, 0, width, height, background);
  }

  fill(x: number, y: number, w: number, h: number, colour: RGB): void {
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    for (let yy = Math.max(0, y); yy < y1; yy += 1) {
      for (let xx = Math.max(0, x); xx < x1; xx += 1) {
        const i = (yy * this.width + xx) * 3;
        this.px[i] = colour[0];
        this.px[i + 1] = colour[1];
        this.px[i + 2] = colour[2];
      }
    }
  }

  /** A filled disc — a head, a shoulder line, a stamp. */
  disc(cx: number, cy: number, r: number, colour: RGB): void {
    for (let yy = Math.max(0, cy - r); yy <= Math.min(this.height - 1, cy + r); yy += 1) {
      for (let xx = Math.max(0, cx - r); xx <= Math.min(this.width - 1, cx + r); xx += 1) {
        if ((xx - cx) ** 2 + (yy - cy) ** 2 > r * r) continue;
        const i = (yy * this.width + xx) * 3;
        this.px[i] = colour[0];
        this.px[i + 1] = colour[1];
        this.px[i + 2] = colour[2];
      }
    }
  }

  /** The band that says "not a document", without needing letters to say it. */
  band(colour: RGB, thickness: number): void {
    for (let yy = 0; yy < this.height; yy += 1) {
      for (let xx = 0; xx < this.width; xx += 1) {
        const d = Math.abs(xx + yy - (this.width + this.height) / 2);
        if (d > thickness) continue;
        const i = (yy * this.width + xx) * 3;
        // Half strength, so it reads as an overlay rather than as a shape.
        for (let c = 0; c < 3; c += 1) this.px[i + c] = ((this.px[i + c] ?? 0) + colour[c]!) >> 1;
      }
    }
  }

  /** Lines of type, as bars. The usual shorthand for "words go here". */
  lines(x: number, y: number, w: number, count: number, colour: RGB): void {
    for (let n = 0; n < count; n += 1) {
      // Ragged right edge, so it reads as prose rather than as a table.
      const width = n === count - 1 ? Math.round(w * 0.55) : Math.round(w * (0.82 + 0.06 * (n % 3)));
      this.fill(x, y + n * 26, Math.min(width, w), 9, colour);
    }
  }

  /** PNG: no filtering, one IDAT. Enough for a handful of flat rectangles. */
  png(): Buffer {
    const stride = this.width * 3 + 1;
    const raw = Buffer.alloc(this.height * stride);
    for (let y = 0; y < this.height; y += 1) {
      raw[y * stride] = 0; // filter: none
      this.px.copy(raw, y * stride + 1, y * this.width * 3, (y + 1) * this.width * 3);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: truecolour
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 6 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);

  let crc = -1;
  for (let i = 4; i < data.length + 8; i += 1) crc = CRC[(crc ^ out[i]!) & 0xff]! ^ (crc >>> 8);
  out.writeUInt32BE((crc ^ -1) >>> 0, data.length + 8);
  return out;
}

const PAPER: RGB = [244, 241, 235];
const INK: RGB = [58, 70, 68];
const FAINT: RGB = [196, 200, 194];
const TEAL: RGB = [15, 95, 88];
const AMBER: RGB = [217, 119, 6];

/** A national ID card: photograph box on the left, particulars on the right. */
function nationalId(): Buffer {
  const c = new Canvas(640, 400, PAPER);
  c.fill(0, 0, 640, 54, TEAL);
  c.lines(24, 20, 240, 1, [190, 214, 210]);
  c.fill(28, 88, 180, 220, [222, 226, 220]);
  c.disc(118, 156, 46, FAINT);
  c.fill(66, 216, 104, 78, FAINT);
  c.lines(240, 100, 370, 6, INK);
  c.fill(240, 286, 370, 2, [214, 218, 212]);
  c.lines(240, 302, 370, 2, FAINT);
  c.band(AMBER, 26);
  return c.png();
}

/** A vehicle registration: a heading, then a table of fields. */
function vehicleRegistration(): Buffer {
  const c = new Canvas(600, 420, PAPER);
  c.fill(0, 0, 600, 46, [222, 226, 220]);
  c.lines(26, 16, 200, 1, INK);
  for (let row = 0; row < 7; row += 1) {
    const y = 86 + row * 44;
    c.fill(26, y, 160, 9, FAINT);
    c.fill(220, y, 300 - (row % 3) * 40, 9, INK);
    c.fill(26, y + 26, 548, 1, [226, 230, 224]);
  }
  c.disc(510, 366, 34, [226, 216, 204]);
  c.band(AMBER, 24);
  return c.png();
}

/** The driver's own photograph: head and shoulders against a plain wall. */
function driverPhoto(): Buffer {
  const c = new Canvas(420, 520, [214, 220, 216]);
  c.fill(0, 380, 420, 140, [188, 196, 192]);
  c.disc(210, 430, 118, [150, 160, 156]); // shoulders
  c.disc(210, 236, 84, [166, 176, 170]); // head
  c.band(AMBER, 22);
  return c.png();
}

const ARTWORK: Record<DocumentKind, () => Buffer> = {
  NATIONAL_ID: nationalId,
  VEHICLE_REGISTRATION: vehicleRegistration,
  DRIVER_PHOTO: driverPhoto,
};

// --- seeding ---------------------------------------------------------------

/** Give one driver the papers they are missing, leaving any they hold alone. */
async function papersFor(driverId: string): Promise<number> {
  const held = await prisma.driverDocument.findMany({
    where: { driverId },
    select: { kind: true },
  });
  const have = new Set(held.map((d) => d.kind));

  let added = 0;
  for (const kind of Object.keys(ARTWORK) as DocumentKind[]) {
    if (have.has(kind)) continue;
    const bytes = ARTWORK[kind]();
    const key = await store.put(bytes, "image/png");
    await prisma.driverDocument.create({
      data: { driverId, kind, key, contentType: "image/png", byteSize: bytes.length },
    });
    added += 1;
  }
  return added;
}

async function main(): Promise<void> {
  if (env.NODE_ENV !== "development") {
    console.error(`Refusing to run with NODE_ENV=${env.NODE_ENV}. This writes fake documents.`);
    process.exit(2);
  }

  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [rawPhone, rawName] = args;

  // Anybody already waiting gets their papers first. A queue holding a driver
  // who cannot be reviewed is the exact problem this script exists to fix.
  const waiting = await prisma.driver.findMany({
    where: { status: "PENDING_REVIEW" },
    select: { id: true, plate: true, user: { select: { name: true } } },
  });

  for (const d of waiting) {
    const added = await papersFor(d.id);
    console.log(
      `${d.user?.name ?? d.plate}: ${added > 0 ? `${added} document(s) added` : "already complete"}`,
    );
  }

  if (waiting.length > 0 && !rawPhone) {
    console.log(`\n${waiting.length} application(s) waiting. Open the console.`);
    return;
  }

  const phone = normalisePhone(rawPhone ?? "672000155");
  const name = rawName ?? "Ngwa Ferdinand";

  const existing = await prisma.user.findUnique({ where: { phone }, include: { driver: true } });
  if (existing?.driver) {
    console.log(`${phone} is already a driver (${existing.driver.status}). Nothing created.`);
    return;
  }

  const zone = await prisma.zone.findFirst({ select: { id: true } });
  const driver = await prisma.driver.create({
    data: {
      user: { create: { phone, name, role: "DRIVER" } },
      plate: `SW ${Math.floor(1000 + Math.random() * 8999)} A`,
      cniNumber: `1${Math.floor(10 ** 8 + Math.random() * 9 * 10 ** 8)}`,
      vehicleType: "CAR",
      status: "PENDING_REVIEW",
      ...(zone ? { homeZone: { connect: { id: zone.id } } } : {}),
    },
    select: { id: true, plate: true },
  });

  const added = await papersFor(driver.id);
  console.log(`Created ${name} (${phone}), plate ${driver.plate}, ${added} documents.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
