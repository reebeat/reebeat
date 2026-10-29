// Throwaway: spec 0007 question 2. Every forbidden SCXML construct must be a decode error of the profile Schema.
import { describe, expect, test } from "bun:test";
import { Result } from "effect";
import { readFileSync } from "node:fs";

import { checkProfile } from "./codec.ts";

const ok = readFileSync(new URL("../fixtures/same-id.scxml", import.meta.url), "utf8");
const firstStateClose = (xml: string, inner: string): string => xml.replace("</state>", `${inner}</state>`);

const forbidden: [string, (x: string) => string][] = [
  ["<script> in <onentry>", (x) => firstStateClose(x, "<onentry><script>x=1</script></onentry>")],
  ["<send> in <onentry>", (x) => firstStateClose(x, '<onentry><send event="e"/></onentry>')],
  ["<log> in <onentry>", (x) => firstStateClose(x, '<onentry><log expr="1"/></onentry>')],
  ["<raise> in <onexit>", (x) => firstStateClose(x, '<onexit><raise event="e"/></onexit>')],
  ["<invoke> in a state", (x) => firstStateClose(x, '<invoke type="x"/>')],
  ["<datamodel> at the root", (x) => x.replace("<state ", '<datamodel><data id="x"/></datamodel><state ')],
  ["<script> at the root", (x) => x.replace("<state ", "<script>x=1</script><state ")],
  ["cond on a transition", (x) => x.replace('event="rb.next"', 'event="rb.next" cond="1==1"')],
  ["datamodel attribute", (x) => x.replace("<scxml ", '<scxml datamodel="ecmascript" ')],
  ["unknown rb: element", (x) => x.replace("<rb:element ", '<rb:bogus x="1"/><rb:element ')],
  ["unknown attribute in the SCXML namespace", (x) => x.replace("<state ", '<state bogus="1" ')],
  ["foreign namespace element", (x) => firstStateClose(x, '<x:y xmlns:x="urn:other"/>')],
  ["history", (x) => firstStateClose(x, '<history id="h"/>')],
];

describe("profile", () => {
  test("the generated document is accepted", () => {
    expect(Result.isSuccess(checkProfile(ok))).toBe(true);
  });
  for (const [name, mutate] of forbidden) {
    test(`rejects ${name}`, () => {
      const doc = mutate(ok);
      expect(doc).not.toBe(ok);
      expect(Result.isFailure(checkProfile(doc))).toBe(true);
    });
  }
});
