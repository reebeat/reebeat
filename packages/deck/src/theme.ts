// The fixed theme of the Deck (spec 0001, "Action Elements"): one light palette, Inter bundled, a 3x3 grid per slide.
// The palette is data; `themeCss` derives the stylesheet from it and the contrast test reads the same data, so the
// claim "every class has at least 4.5:1" is checked on the values the stylesheet uses.
import type { Element } from "@reebeat/core";
import { Array as Arr } from "effect";

type Cell = Element["cell"];

type ElementClass = Element["classes"][number];

/** Colours of the theme as `#rrggbb`. */
export const palette = {
  accent: "#1a3fa8",
  boxBackground: "#e3e8f5",
  boxBorder: "#2f4ea2",
  focusRing: "#d9480f",
  muted: "#4b5263",
  slideBackground: "#f7f5f0",
  text: "#1d2433",
} as const;

/** The text colour of each theme class; the class's own background is `slideBackground` unless it is `box`. */
export const classColors = {
  accent: palette.accent,
  box: palette.text,
  label: palette.text,
  muted: palette.muted,
  title: palette.text,
} as const satisfies Record<ElementClass, string>;

/** Grid position (1-based row and column) of each cell of the 3x3 grid. */
const gridCells = {
  bc: { column: 2, row: 3 },
  bl: { column: 1, row: 3 },
  br: { column: 3, row: 3 },
  mc: { column: 2, row: 2 },
  ml: { column: 1, row: 2 },
  mr: { column: 3, row: 2 },
  tc: { column: 2, row: 1 },
  tl: { column: 1, row: 1 },
  tr: { column: 3, row: 1 },
} as const satisfies Record<Cell, { column: number; row: number }>;

/** The nine cells in reading order. */
export const cellOrder = [
  "tl",
  "tc",
  "tr",
  "ml",
  "mc",
  "mr",
  "bl",
  "bc",
  "br",
] as const satisfies readonly Cell[];

/** The Inter faces bundled with the Deck, as file names under `assets/fonts/`. */
export const fontFaces = [
  { file: "inter-latin-400-normal.woff2", weight: 400 },
  { file: "inter-latin-700-normal.woff2", weight: 700 },
] as const;

const flexEdges = { 1: "flex-start", 2: "center", 3: "flex-end" } as const;

const alignment = { 1: "left", 2: "center", 3: "right" } as const;

const fontFaceCss = (): string =>
  Arr.join(
    Arr.map(
      fontFaces,
      ({ file, weight }) =>
        `@font-face {\n  font-family: "Inter";\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: block;\n  src: url("fonts/${file}") format("woff2");\n}`
    ),
    "\n"
  );

const cellCss = (): string =>
  Arr.join(
    Arr.map(cellOrder, (name) => {
      const { column, row } = gridCells[name];

      return `.cell-${name} {\n  grid-area: ${row} / ${column};\n  align-items: ${flexEdges[column]};\n  justify-content: ${flexEdges[row]};\n  text-align: ${alignment[column]};\n}`;
    }),
    "\n"
  );

/** The text of `assets/theme.css`. A pure function of the palette: no input, so the same bytes every time. */
export const themeCss = (): string =>
  `${fontFaceCss()}

html,
body,
.reveal-viewport {
  background: ${palette.slideBackground};
}

.reveal {
  font-family: "Inter", sans-serif;
  font-size: 28px;
  color: ${palette.text};
}

.reveal .slides > section {
  box-sizing: border-box;
  height: 100%;
  padding: 0;
  text-align: left;
}

.grid {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  grid-template-rows: repeat(3, 1fr);
  width: 100%;
  height: 100%;
  padding: 36px;
  gap: 12px;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
}

${cellCss()}

.el {
  margin: 0;
  line-height: 1.25;
  color: ${palette.text};
  transition:
    opacity 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.el.box {
  box-sizing: border-box;
  padding: 18px 26px;
  border: 3px solid ${palette.boxBorder};
  border-radius: 14px;
  background: ${palette.boxBackground};
  color: ${classColors.box};
  font-size: 26px;
  font-weight: 700;
}

.el.title {
  font-size: 46px;
  font-weight: 700;
  line-height: 1.1;
  color: ${classColors.title};
}

.el.label {
  font-size: 26px;
  font-weight: 700;
  color: ${classColors.label};
}

.el.accent {
  color: ${classColors.accent};
  font-weight: 700;
}

.el.muted {
  color: ${classColors.muted};
}

.el.hidden {
  opacity: 0;
}

.el.shown {
  opacity: 1;
}

.el.focused {
  box-shadow: 0 0 0 5px ${palette.focusRing};
  border-radius: 14px;
  transform: scale(1.04);
}

.cue {
  display: none;
}
`;
