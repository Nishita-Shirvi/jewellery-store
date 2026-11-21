import { ownModelPhoto, TILE_BOX, type CategoryTile } from "@/lib/tiles";

/**
 * The velvet display model (bust, head or hand) with the piece "worn" on it, drawn in SVG in
 * the shop's colours (--s-m-* tokens, so it follows the theme and dark mode). With the shop's
 * own model photo, the photo is shown instead and no piece is drawn.
 */

const C = {
  hi: "var(--s-m-hi)",
  deep: "var(--s-m-deep)",
  shade: "var(--s-m-shade)",
  rim: "var(--s-m-rim)",
  hair: "var(--s-m-hair)",
};

function Velvet({ kind, uid }: { kind: "bust" | "head" | "hand"; uid: string }) {
  const g = `v${uid}`;
  const f1 = { fill: `url(#${g})`, style: { stroke: C.rim }, strokeWidth: 1 };
  const fs = { fill: `url(#${g}s)`, style: { stroke: C.rim }, strokeWidth: 1 };
  const defs = (
    <defs>
      <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style={{ stopColor: C.hi }} />
        <stop offset=".55" style={{ stopColor: C.deep }} />
        <stop offset="1" style={{ stopColor: C.shade }} />
      </linearGradient>
      <radialGradient id={`${g}s`} cx=".38" cy=".3" r=".7">
        <stop offset="0" style={{ stopColor: C.hi }} />
        <stop offset="1" style={{ stopColor: C.deep }} />
      </radialGradient>
    </defs>
  );
  if (kind === "head")
    return (
      <>
        {defs}
        <path
          {...f1}
          d="M116 236 L116 318 C116 350 74 364 22 374 L0 380 L0 400 L300 400 L300 380 L278 374 C226 364 184 350 184 318 L184 236 Z"
        />
        <ellipse {...f1} cx="76" cy="176" rx="12" ry="24" />
        <ellipse {...f1} cx="224" cy="176" rx="12" ry="24" />
        <ellipse {...fs} cx="150" cy="168" rx="72" ry="96" />
        <path
          style={{ fill: C.hair }}
          d="M76 160 C70 92 108 54 150 54 C192 54 230 92 224 160 C218 128 196 108 172 104 C162 102 154 106 150 114 C146 106 138 102 128 104 C104 108 82 128 76 160 Z"
        />
      </>
    );
  if (kind === "bust")
    return (
      <>
        {defs}
        <path
          {...f1}
          d="M106 30 L106 128 C106 166 62 182 24 196 C8 202 0 214 0 232 L0 400 L300 400 L300 232 C300 214 292 202 276 196 C238 182 194 166 194 128 L194 30 Z"
        />
        <ellipse
          cx="150"
          cy="30"
          rx="44"
          ry="9"
          style={{ fill: C.hi, stroke: C.rim }}
          strokeWidth={1}
        />
      </>
    );
  const finger = (x: number, y: number, w: number, h: number) => (
    <rect key={x} {...f1} x={x} y={y} width={w} height={h} rx={w / 2} />
  );
  return (
    <>
      {defs}
      <path {...f1} d="M112 290 L188 290 L192 400 L108 400 Z" />
      <rect {...f1} x="72" y="176" width="30" height="110" rx="15" transform="rotate(-30 87 284)" />
      {finger(93, 96, 28, 140)}
      {finger(123, 74, 29, 160)}
      {finger(154, 86, 28, 150)}
      {finger(184, 116, 25, 120)}
      <path
        {...f1}
        d="M92 186 L210 186 L210 250 C210 286 196 302 188 310 L112 310 C104 302 90 286 90 252 Z"
      />
      <path
        d="M123 190 L123 214 M153 190 L153 216 M183 190 L183 212"
        style={{ stroke: C.shade }}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.5}
      />
    </>
  );
}

/** The piece, centred on (cx, cy); on the head it's mirrored onto the other ear too. */
export function Piece({ tile }: { tile: CategoryTile }) {
  if (!tile.piece || ownModelPhoto(tile) || tile.model === "none") return null;
  const h = tile.w * tile.ar;
  const one = (cx: number, mirrored: boolean) => (
    <g
      key={mirrored ? "r" : "l"}
      transform={`rotate(${mirrored ? -tile.rot : tile.rot} ${cx} ${tile.cy})${mirrored ? ` translate(${2 * cx} 0) scale(-1 1)` : ""}`}
    >
      <image
        href={tile.piece}
        x={cx - tile.w / 2}
        y={tile.cy - h / 2}
        width={tile.w}
        height={h}
        preserveAspectRatio="none"
      />
    </g>
  );
  return (
    <>
      {one(tile.cx, false)}
      {tile.model === "head" && one(TILE_BOX.width - tile.cx, true)}
    </>
  );
}

export function ModelLayer({ tile, uid }: { tile: CategoryTile; uid: string }) {
  if (ownModelPhoto(tile))
    return (
      <image
        href={tile.modelPhoto}
        x="0"
        y="0"
        width={TILE_BOX.width}
        height={TILE_BOX.height}
        preserveAspectRatio="xMidYMid slice"
      />
    );
  const kind = tile.model === "head" || tile.model === "hand" ? tile.model : "bust";
  return <Velvet kind={kind} uid={uid} />;
}
