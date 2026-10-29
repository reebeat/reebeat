// The IR of stories/same-id (spec 0004 Graph, as canonical JSON) and its speech timings, read from plain files.
// Throwaway spike code: the IR types are the minimum this spike reads, not the 0004 schema (which stays in spike/scxml/vendor).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type TransitionKind = "auto-animate" | "cut" | "default";

export interface IrElement {
  readonly id: string;
  readonly visible: boolean;
  readonly class: string;
  readonly cell: string;
  readonly text?: string;
  readonly line: number;
}

export interface IrLine {
  readonly id: string;
  readonly line: number;
  readonly text: string;
  readonly words: readonly string[];
  readonly hints: { readonly pauseBefore: number; readonly speed: number };
}

export type Anchor =
  | { readonly kind: "word"; readonly phrase: string; readonly occurrence: number; readonly edge: "start" | "end"; readonly explicit: boolean }
  | {
      readonly kind: "edge";
      readonly at: "start" | "end" | { readonly percent: number };
      readonly subject: { readonly kind: "scene" } | { readonly kind: "element"; readonly id: string };
      readonly transition: string;
    };

export type When =
  | { readonly absoluteFlicks: number; readonly reason: string }
  | {
      readonly event:
        | { readonly kind: "anchor"; readonly anchor: Anchor }
        | {
            readonly kind: "shift";
            readonly of: { readonly anchor: Anchor };
            readonly offset: { readonly unit: "flicks" | "f" | "percent"; readonly value: number };
          };
    };

export interface IrEffect {
  readonly id: string;
  readonly line: number;
  readonly verb: "show" | "focus" | "sound";
  readonly target?: string | null;
  readonly name?: string;
  readonly when: When;
  readonly written: string;
}

export interface IrScene {
  readonly id: string;
  readonly chapterId: string;
  readonly transition: TransitionKind;
  readonly heading: string;
  readonly line: number;
  readonly elements: readonly IrElement[];
  readonly lines: readonly IrLine[];
  readonly effects: readonly IrEffect[];
  readonly events: readonly unknown[];
}

export interface IrChapter {
  readonly id: string;
  readonly line: number;
  readonly sceneIds: readonly string[];
  readonly synopsis: string;
  readonly title: string;
}

export interface Ir {
  readonly author?: string;
  readonly chapters: readonly IrChapter[];
  readonly scenes: readonly IrScene[];
  readonly speed: number;
  readonly title: string;
  readonly version: number;
}

export interface SpeechWord {
  readonly w: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface Speech {
  readonly durationMs: number;
  readonly words: readonly SpeechWord[];
}

const here = new URL(".", import.meta.url).pathname;
export const irPath = join(here, "../../scxml/fixtures/same-id.graph.json");
export const speechDir = join(here, "../../../stories/same-id/speech-cache");

export const loadIr = (): Ir => JSON.parse(readFileSync(irPath, "utf8")) as Ir;

/**
 * Speech by narration text. The cache key of an asset is derived from the Line text (provenance `keyParts.input`),
 * so a Line finds its asset by its text; `durationMs` and `words` are what the aligner measured (whisper.cpp).
 */
export const loadSpeech = (): ReadonlyMap<string, Speech> => {
  const byText = new Map<string, Speech>();
  for (const name of readdirSync(speechDir)) {
    if (!name.endsWith(".provenance.json")) continue;
    const key = name.slice(0, -".provenance.json".length);
    const prov = JSON.parse(readFileSync(join(speechDir, name), "utf8")) as { provenance: { keyParts: { input: string } } };
    const words = JSON.parse(readFileSync(join(speechDir, `${key}.words.json`), "utf8")) as Speech;
    byText.set(prov.provenance.keyParts.input, { durationMs: words.durationMs, words: words.words });
  }
  return byText;
};
