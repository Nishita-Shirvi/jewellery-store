/**
 * Removes a plain background from a product photo, in the admin's browser (free; no paid
 * service). It keys out the colour found around the edges of the photo, softens the edge, and
 * crops to the piece. Works best for a piece photographed from the front on a plain, even
 * background; admins can also upload a PNG that already has a transparent background.
 */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface Cutout {
  blob: Blob;
  /** Height ÷ width of the cropped piece. */
  ar: number;
  /** Object URL for showing it straight away. */
  previewUrl: string;
}

export async function removeBackground(file: File, maxSide = 900): Promise<Cutout> {
  const source = URL.createObjectURL(file);
  try {
    const img = await loadImage(source);
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.max(1, Math.round(img.naturalWidth * k));
    const H = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, W, H);
    const data = g.getImageData(0, 0, W, H);
    const d = data.data;

    // The background colour: the median of samples taken all round the edge.
    const samples: [number, number, number][] = [];
    const at = (x: number, y: number): [number, number, number] => {
      const i = (y * W + x) * 4;
      return [d[i]!, d[i + 1]!, d[i + 2]!];
    };
    const step = Math.max(1, Math.floor((W + H) / 300));
    for (let x = 0; x < W; x += step) samples.push(at(x, 0), at(x, H - 1));
    for (let y = 0; y < H; y += step) samples.push(at(0, y), at(W - 1, y));
    const median = [0, 1, 2].map((ch) => {
      const a = samples.map((s) => s[ch]!).sort((p, q) => p - q);
      return a[a.length >> 1]!;
    });
    const dist = (r: number, gg: number, b: number) =>
      Math.hypot(r - median[0]!, gg - median[1]!, b - median[2]!);
    const edge = samples.map((s) => dist(s[0], s[1], s[2])).sort((p, q) => p - q);
    // Fully clear below t1, fully kept above t2, a soft edge in between.
    const t1 = Math.min(90, edge[Math.floor(edge.length * 0.9)]! + 12);
    const t2 = t1 + 45;

    const rows = new Uint16Array(H);
    const cols = new Uint16Array(W);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const a = clamp((dist(d[i]!, d[i + 1]!, d[i + 2]!) - t1) / (t2 - t1), 0, 1);
        d[i + 3] = Math.round(a * 255);
        if (a > 0.6) {
          rows[y]!++;
          cols[x]!++;
        }
      }
    g.putImageData(data, 0, 0);

    // Crop to the piece (ignoring specks of a pixel or two).
    const first = (arr: Uint16Array) =>
      Math.max(
        0,
        arr.findIndex((v) => v > 2),
      );
    const last = (arr: Uint16Array) => {
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i]! > 2) return i;
      return arr.length - 1;
    };
    const x0 = first(cols);
    const x1 = Math.max(x0, last(cols));
    const y0 = first(rows);
    const y1 = Math.max(y0, last(rows));
    const out = document.createElement("canvas");
    out.width = x1 - x0 + 1;
    out.height = y1 - y0 + 1;
    out
      .getContext("2d")!
      .drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png"),
    );
    return { blob, ar: out.height / out.width, previewUrl: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(source);
  }
}

/** Height ÷ width of an image file that already has a transparent background. */
export async function imageAspect(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return img.naturalHeight / Math.max(1, img.naturalWidth);
  } finally {
    URL.revokeObjectURL(url);
  }
}
