/**
 * Category tiles on the home page: a cut-out of a piece "worn" on a velvet display model (bust,
 * head or hand, drawn in SVG in the shop's colours), or on the shop's own model photo. Hovering
 * (or tapping on a phone) grows the full product photo out of the spot where the piece sits.
 *
 * Positions are in the model's 300 × 400 box: cx/cy = centre of the piece, w = its width,
 * ar = height ÷ width of the cut-out, rot = turn in degrees. Pure: shared by shop and admin.
 */

export const TILE_MODELS = [
  { value: "bust", label: "Velvet bust (necklaces, chains, mangalsutra)" },
  { value: "head", label: "Velvet head (earrings, shown on both ears)" },
  { value: "hand", label: "Velvet hand (rings, bangles)" },
  { value: "photo", label: "Our own model photo" },
  { value: "none", label: "No model: just the category photo" },
] as const;
export type TileModel = (typeof TILE_MODELS)[number]["value"];

export interface CategoryTile {
  model: TileModel;
  /** Cut-out of the piece (PNG/WebP with a transparent background). "" = none. */
  piece: string;
  ar: number;
  cx: number;
  cy: number;
  w: number;
  rot: number;
  /** Photo that grows out on hover. "" = the category's own image. */
  zoom: string;
  zoomAlt: string;
  /** For model = "photo": the shop's own photo of a model wearing the piece. */
  modelPhoto: string;
}

export const TILE_BOX = { width: 300, height: 400 } as const;

/** Where a new piece goes on each model before the admin drags it. */
export function placeDefault(
  model: TileModel,
  ar: number,
): Pick<CategoryTile, "cx" | "cy" | "w" | "rot"> {
  if (model === "head") return { w: 30, cx: 76, cy: Math.round(196 + (30 * ar) / 2), rot: 0 };
  if (model === "hand") return { w: 50, cx: 168, cy: Math.round(194 + (50 * ar) / 2), rot: 0 };
  return { w: 130, cx: 150, cy: Math.round(134 + Math.min(130 * ar, 240) / 2), rot: 0 };
}

const SAMPLE = "/images/tiles";

/** Sample tiles shipped with the shop (stock photos), used until the admin sets their own. */
const SAMPLES: { match: RegExp; tile: CategoryTile }[] = [
  {
    match: /earring|jhumk|stud|bali/,
    tile: {
      model: "head",
      piece: `${SAMPLE}/piece-earrings.png`,
      ar: 2.1327,
      cx: 76,
      cy: 232,
      w: 30,
      rot: 0,
      zoom: `${SAMPLE}/photo-earrings.webp`,
      zoomAlt: "Gold jhumka earrings on black cloth",
      modelPhoto: "",
    },
  },
  {
    match: /mangalsutra/,
    tile: {
      model: "bust",
      piece: `${SAMPLE}/piece-mangalsutra.png`,
      ar: 1.2944,
      cx: 156,
      cy: 206,
      w: 170,
      rot: 33,
      zoom: `${SAMPLE}/photo-mangalsutra.webp`,
      zoomAlt: "Black-bead mangalsutra with a gold pendant",
      modelPhoto: "",
    },
  },
  {
    match: /chain/,
    tile: {
      model: "bust",
      piece: `${SAMPLE}/piece-chain.png`,
      ar: 3.6955,
      cx: 150,
      cy: 236,
      w: 64,
      rot: 0,
      zoom: `${SAMPLE}/photo-chain.webp`,
      zoomAlt: "Long gold chain on a white stand",
      modelPhoto: "",
    },
  },
  {
    match: /necklace|pendant|choker|haar|set/,
    tile: {
      model: "bust",
      piece: `${SAMPLE}/piece-necklace.png`,
      ar: 0.8442,
      cx: 150,
      cy: 184,
      w: 132,
      rot: 0,
      zoom: `${SAMPLE}/photo-necklace.webp`,
      zoomAlt: "Gold temple necklace on maroon velvet",
      modelPhoto: "",
    },
  },
  {
    match: /bangle|bracelet|kada|kangan/,
    tile: {
      model: "hand",
      piece: `${SAMPLE}/piece-bangles.png`,
      ar: 0.765,
      cx: 150,
      cy: 338,
      w: 96,
      rot: 90,
      zoom: `${SAMPLE}/photo-bangles.webp`,
      zoomAlt: "Patterned gold bangles on a stand",
      modelPhoto: "",
    },
  },
  {
    match: /ring/,
    tile: {
      model: "hand",
      piece: `${SAMPLE}/piece-ring.png`,
      ar: 0.6545,
      cx: 168,
      cy: 200,
      w: 58,
      rot: 0,
      zoom: `${SAMPLE}/photo-ring.webp`,
      zoomAlt: "Gold ring with coloured stones",
      modelPhoto: "",
    },
  },
];

/** The sample tile for a category, from words in its URL name or name (earrings before rings). */
export function sampleTile(category: { slug: string; name: string }): CategoryTile | null {
  const text = `${category.slug} ${category.name}`.toLowerCase();
  return SAMPLES.find((s) => s.match.test(text))?.tile ?? null;
}

/** Does the tile show the shop's own model photo instead of a velvet model? */
export const ownModelPhoto = (t: CategoryTile) => t.model === "photo" && t.modelPhoto !== "";

/** Hover zoom starts from the piece: its centre as a percentage of the tile. */
export function zoomOrigin(t: CategoryTile): { "--ox": string; "--oy": string } {
  if (ownModelPhoto(t)) return { "--ox": "50%", "--oy": "45%" };
  return {
    "--ox": `${((t.cx / TILE_BOX.width) * 100).toFixed(2)}%`,
    "--oy": `${((t.cy / TILE_BOX.height) * 100).toFixed(2)}%`,
  };
}
