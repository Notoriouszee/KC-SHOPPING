/**
 * Reads pixel dimensions out of PNG, JPEG and WebP headers.
 *
 * Social platforms use `og:image:width`/`height` to decide how to lay out a
 * preview, and a wrong value is worse than none. Uploaded images are validated by
 * magic bytes elsewhere; this parses just enough of the header to report the size.
 */

export type Dimensions = { width: number; height: number };

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

/** PNG: IHDR is always the first chunk, width/height big-endian at 16 and 20. */
function pngDimensions(bytes: Uint8Array): Dimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** JPEG: walk segments until a Start Of Frame, then read height/width. */
function jpegDimensions(bytes: Uint8Array): Dimensions | null {
  let offset = 2; // skip SOI

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    // Padding bytes (0xFF) may repeat before a marker.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Markers without a length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return null;

    if (JPEG_SOF_MARKERS.has(marker)) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (width === 0 || height === 0) return null;
      return { width, height };
    }

    offset += 2 + length;
  }

  return null;
}

/** WebP has three container variants, each storing the size differently. */
function webpDimensions(bytes: Uint8Array): Dimensions | null {
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (chunk === "VP8 ") {
    if (bytes.length < 30) return null;
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    if (width === 0 || height === 0) return null;
    return { width, height };
  }

  if (chunk === "VP8L") {
    if (bytes.length < 25) return null;
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  if (chunk === "VP8X") {
    if (bytes.length < 30) return null;
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  return null;
}

export function imageDimensions(bytes: Uint8Array): Dimensions | null {
  try {
    if (isPng(bytes)) return pngDimensions(bytes);
    if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return jpegDimensions(bytes);
    }
    if (
      bytes.length >= 25 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return webpDimensions(bytes);
    }
    return null;
  } catch {
    // Truncated or malformed headers must never break an upload.
    return null;
  }
}
