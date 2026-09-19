/**
 * Large honeycomb pattern behind the white sections of the app.
 *
 * Sized to match altrium.io — hexagons roughly 340px tall, drawn as
 * thin outlines. Big and sparse reads as brand texture; small and
 * dense reads as graph paper.
 *
 * To resize: change HEX_RADIUS. Everything else derives from it, so
 * the tiling stays correct. 170 gives hexes about 294px wide.
 * To change weight: STROKE_OPACITY.
 */
const HEX_RADIUS = 170;
const STROKE_OPACITY = 0.07;

// Pointy-top hexagon geometry.
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS; // flat-to-flat, ~294
const HALF = HEX_WIDTH / 2;
const ROW_SPACING = HEX_RADIUS * 1.5; // vertical distance between rows
const TILE_HEIGHT = ROW_SPACING * 2; // two rows completes the repeat

function hexPath(cx, cy) {
  const r = HEX_RADIUS;
  return [
    `M${cx} ${cy - r}`,
    `L${cx + HALF} ${cy - r / 2}`,
    `L${cx + HALF} ${cy + r / 2}`,
    `L${cx} ${cy + r}`,
    `L${cx - HALF} ${cy + r / 2}`,
    `L${cx - HALF} ${cy - r / 2}`,
    "Z",
  ].join(" ");
}

export default function HoneycombBackground() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none bg-white" aria-hidden="true">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id="honeycomb"
            width={HEX_WIDTH}
            height={TILE_HEIGHT}
            patternUnits="userSpaceOnUse"
          >
            {/* Top row, centred in the tile. */}
            <path
              d={hexPath(HALF, HEX_RADIUS)}
              fill="none"
              stroke={`rgba(17,17,17,${STROKE_OPACITY})`}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />

            {/* Second row, offset half a tile across — this interlock is
                what makes it a comb rather than a grid. Drawn twice so
                the halves either side of the tile edge line up. */}
            <path
              d={hexPath(0, HEX_RADIUS + ROW_SPACING)}
              fill="none"
              stroke={`rgba(17,17,17,${STROKE_OPACITY})`}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d={hexPath(HEX_WIDTH, HEX_RADIUS + ROW_SPACING)}
              fill="none"
              stroke={`rgba(17,17,17,${STROKE_OPACITY})`}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#honeycomb)" />
      </svg>
    </div>
  );
}
