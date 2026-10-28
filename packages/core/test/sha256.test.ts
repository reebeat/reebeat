// SHA-256 of the source is part of the Plan (every output embeds it): check the plain implementation against
// the FIPS 180-4 test vectors, the padding boundaries and a multi-byte text.
import { assert, describe, it } from "@effect/vitest";

import { sha256Hex, sha256OfText } from "../src/sha256.ts";

describe("sha256", () => {
  it("matches the FIPS 180-4 vectors", () => {
    assert.strictEqual(
      sha256OfText(""),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    assert.strictEqual(
      sha256OfText("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    assert.strictEqual(
      sha256OfText("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
    );
    assert.strictEqual(
      sha256Hex(new Uint8Array(1_000_000).fill(0x61)),
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
    );
  });

  it("agrees with the system digest across the padding boundaries", () => {
    // Digests of "a" repeated n times, from `printf a... | sha256sum`, at the lengths where padding changes block count.
    const expected = [
      [55, "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318"],
      [56, "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a"],
      [64, "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb"],
    ] as const;

    for (const [length, digest] of expected) {
      assert.strictEqual(
        sha256OfText("a".repeat(length)),
        digest,
        `${length} bytes`
      );
    }
  });

  it("hashes the UTF-8 bytes of a text", () => {
    assert.strictEqual(
      sha256OfText("héllo wörld ✓"),
      sha256Hex(
        new Uint8Array([
          104, 195, 169, 108, 108, 111, 32, 119, 195, 182, 114, 108, 100, 32,
          226, 156, 147,
        ])
      )
    );
  });
});
