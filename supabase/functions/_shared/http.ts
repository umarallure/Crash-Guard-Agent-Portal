type JsonBodyFailure = {
  ok: false;
  status: 400 | 413 | 415;
  code: "invalid_json" | "payload_too_large" | "unsupported_media_type";
  message: string;
};

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | JsonBodyFailure;

const isJsonContentType = (value: string | null): boolean => {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
};

/** Read and parse a JSON body without allowing an unbounded allocation. */
export const readJsonBody = async (
  req: Request,
  maxBytes: number,
): Promise<JsonBodyResult> => {
  if (!isJsonContentType(req.headers.get("content-type"))) {
    return {
      ok: false,
      status: 415,
      code: "unsupported_media_type",
      message: "Content-Type must be application/json.",
    };
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    return {
      ok: false,
      status: 413,
      code: "payload_too_large",
      message: "Request payload is too large.",
    };
  }

  if (!req.body) {
    return { ok: false, status: 400, code: "invalid_json", message: "A JSON body is required." };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size rejection remains authoritative even if cancellation fails.
        }
        return {
          ok: false,
          status: 413,
          code: "payload_too_large",
          message: "Request payload is too large.",
        };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, code: "invalid_json", message: "Unable to read request body." };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(json) };
  } catch {
    return { ok: false, status: 400, code: "invalid_json", message: "Invalid JSON payload." };
  }
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const isValidTimeZone = (timeZone: string): boolean => {
  if (!timeZone || timeZone.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
};
