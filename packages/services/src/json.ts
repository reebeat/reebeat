// Type guards over `Schema.Json` that narrow in both branches: the plain guards of the `Array` and `Predicate`
// modules leave `JsonArray` behind in the false branch.
import { Array as Arr, Predicate } from "effect";
import type { Schema } from "effect";

export const isJsonArray = (value: Schema.Json): value is Schema.JsonArray =>
  Arr.isArray(value);

export const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value);
