// What every rule returns: the rule's name, a sentence a person can act on and, where the rule can say, where it
// applies. A rule is a plain function from data to a list of these; an empty list means the rule holds.

export interface Diagnostic {
  /** The position of the first difference in its list (for a fragment rule: the index in the scene), when known. */
  readonly index?: number;
  /** The source line the rule points at, when the data carries one. */
  readonly line?: number;
  readonly message: string;
  /** The rule's name, such as `effect-fragment-agreement`. */
  readonly rule: string;
  /** The Scene the diagnostic concerns, when it concerns one. */
  readonly sceneId?: string;
  /** `error` (the default) fails `tsukuri lint`; `info` only lists, such as an absolute time that has its reason. */
  readonly severity?: "error" | "info";
}
