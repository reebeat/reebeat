import pkg from "../package.json" with { type: "json" };

/** The CLI's version: the one in its manifest. */
export const version: string = pkg.version;
