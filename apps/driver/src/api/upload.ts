/**
 * Sending a photograph to the API.
 *
 * Kept apart from `client.ts` because it does not go through `fetch` at all.
 * A phone photo is two to four megabytes; reading that into a JavaScript string
 * to hand to `fetch` is how an Android Go handset runs out of memory mid-upload.
 * `expo-file-system`'s UploadTask streams the file straight off disk into the body,
 * which is also exactly the shape the API wants — a raw body, one file, kind in
 * the path, no multipart.
 *
 * The one thing this shares with the rest of the app is the failure contract:
 * every error comes back as an ApiError with a `code`, so a screen chooses its
 * own words and never renders the server's English.
 */

import { File, UploadTask, UploadType, type UploadResult } from "expo-file-system";
import { ApiError, apiBaseUrl, getToken } from "./client";
import type { DocumentKind } from "./driver";

/** What the camera hands back, mapped to what the API will accept. */
function contentTypeFor(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  // expo-image-picker writes JPEG by default, and an unknown extension from a
  // gallery pick is far more likely to be one than anything else.
  return "image/jpeg";
}

/**
 * Upload one document, replacing whatever was there before.
 *
 * Resolves when the server has it. Throws ApiError otherwise — including for
 * the refusals worth telling him about: a file that is not really an image,
 * and one too big to send.
 */
export async function uploadDocument(kind: DocumentKind, uri: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new ApiError("not_signed_in", "No token.", 401);

  let result: UploadResult;
  try {
    // BINARY_CONTENT puts the file in the body untouched, which is exactly the
    // shape the API wants: one raw image, kind in the path, no multipart.
    const task = new UploadTask(
      new File(uri),
      `${apiBaseUrl()}/drivers/me/documents/${kind.toLowerCase()}`,
      {
        httpMethod: "PUT",
        uploadType: UploadType.BINARY_CONTENT,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": contentTypeFor(uri),
        },
      },
    );
    result = await task.uploadAsync();
  } catch {
    // The request never landed — a dropped connection on the Soppo climb, not
    // a refusal. The caller offers a retry rather than an explanation.
    throw ApiError.offline();
  }

  if (result.status >= 200 && result.status < 300) return;

  let code = `http_${result.status}`;
  let message = `Upload failed (${result.status})`;
  try {
    const parsed = JSON.parse(result.body) as { error?: { code?: string; message?: string } };
    if (parsed.error?.code) code = parsed.error.code;
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    // A body that is not our JSON. The status is all we have.
  }
  throw new ApiError(code, message, result.status);
}
