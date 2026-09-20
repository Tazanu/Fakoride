/**
 * Where a driver's documents are kept.
 *
 * These are photographs of national ID cards. Three rules follow from that and
 * none of them is negotiable:
 *
 *   1. Nothing here is ever served as a static file. There is no public URL, no
 *      predictable path, no directory listing. The only way back out is an
 *      authenticated ops route that streams the bytes.
 *   2. The key is generated, never derived from anything the driver sent. A
 *      filename from a phone is user input and belongs nowhere near a path.
 *   3. The store is behind a port, like payments and SMS, so moving from a disk
 *      to R2 is a config change rather than an edit to every call site.
 *
 * `local` writes to a directory outside the repo and is what development uses.
 * `r2` is the production adapter and deliberately throws until it is wired —
 * an adapter that silently does nothing is worse than one that refuses.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../env";
import { ApiError } from "../../lib/http";
import { logger } from "../../lib/logger";

export type StoredDocument = { bytes: Buffer; contentType: string };

export interface DocumentStore {
  /** Returns the key to record. Never takes one — the store decides. */
  put(bytes: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<StoredDocument>;
  remove(key: string): Promise<void>;
}

/** The only three types a phone camera will produce that we are willing to keep. */
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/**
 * What the bytes actually are, regardless of what the header claimed.
 *
 * A content-type header is a client assertion. Someone uploading a script with
 * `content-type: image/jpeg` should be refused by what the file *is*, so the
 * magic numbers decide and the header is only a hint.
 */
export function sniff(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** Throws unless these bytes are an image we accept, at a size we accept. */
export function assertAcceptable(bytes: Buffer): string {
  if (bytes.length === 0) throw new ApiError(400, "empty_file", "That file is empty.");
  if (bytes.length > env.DOCUMENT_MAX_BYTES) {
    throw new ApiError(413, "file_too_large", "That photo is too large. Take it again.");
  }
  const real = sniff(bytes);
  if (!real || !ALLOWED.has(real)) {
    throw new ApiError(415, "not_an_image", "Send a JPEG, PNG or WebP photo.");
  }
  return real;
}

class LocalDocumentStore implements DocumentStore {
  private readonly root = path.resolve(env.DOCUMENT_DIR);

  async put(bytes: Buffer, contentType: string): Promise<string> {
    // Two random segments: one directory, one name. The directory keeps any
    // single folder from growing to tens of thousands of entries, and neither
    // half is guessable from anything the driver knows.
    const ext = ALLOWED.get(contentType) ?? "bin";
    const shard = randomBytes(1).toString("hex");
    const name = `${randomBytes(24).toString("hex")}.${ext}`;
    const key = `${shard}/${name}`;

    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes, { mode: 0o600 });
    return key;
  }

  async get(key: string): Promise<StoredDocument> {
    const full = this.resolve(key);
    try {
      const bytes = await readFile(full);
      return { bytes, contentType: sniff(bytes) ?? "application/octet-stream" };
    } catch {
      throw new ApiError(404, "no_document", "That document is not here any more.");
    }
  }

  async remove(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined);
  }

  /**
   * Turn a stored key into a path, refusing anything that climbs out.
   *
   * Keys are generated here so this should never fire — which is exactly why
   * it is worth having. A traversal bug in a store holding ID cards is not a
   * bug anybody wants to find in production.
   */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      logger.error({ key }, "document key escaped the store root");
      throw new ApiError(400, "bad_key", "That is not a document key.");
    }
    return full;
  }
}

class R2DocumentStore implements DocumentStore {
  async put(): Promise<string> {
    throw new ApiError(503, "storage_unavailable", "Document storage is not configured yet.");
  }
  async get(): Promise<StoredDocument> {
    throw new ApiError(503, "storage_unavailable", "Document storage is not configured yet.");
  }
  async remove(): Promise<void> {
    // TODO: wire R2 here. Keep the interface: put returns a key, get streams it
    // back, and nothing is ever made publicly readable.
    throw new ApiError(503, "storage_unavailable", "Document storage is not configured yet.");
  }
}

export const documents: DocumentStore =
  env.DOCUMENT_STORE === "local" ? new LocalDocumentStore() : new R2DocumentStore();

if (env.DOCUMENT_STORE === "local") {
  logger.warn(
    { dir: path.resolve(env.DOCUMENT_DIR) },
    "documents: LOCAL store — ID photographs are written to this machine's disk",
  );
}

/** A stable fingerprint, for logging that a file changed without logging the file. */
export function fingerprint(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}
