// An optional field of a result is an absent key, never `undefined` (`exactOptionalPropertyTypes`): `present` says
// so at the one place that builds the key.
import { Record as Rec } from "effect";

/** `{ [key]: value }` when `value` is there, else `{}`. */
export const present = <K extends string, V>(
  key: K,
  value: V | undefined
): Partial<Record<K, V>> =>
  value === undefined ? {} : Rec.singleton(key, value);
