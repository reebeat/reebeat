# Provenance of tools/quality

Source: [`phibkro/vektorprogrammet-reimagined`](https://github.com/phibkro/vektorprogrammet-reimagined) at commit `797e9e41d96194b9479ff224ac1c40bbc0545888`, directory `tools/quality`.

| File | From the donor | Deviation |
| --- | --- | --- |
| `checkEffectExceptions.ts` | `checkEffectExceptions.ts` | Only the entry point is left: it lists files with `git ls-files` and calls `checkExceptions`. |
| `effectExceptions.ts` | the body of `checkEffectExceptions.ts` | Split out and parameterised (file list, registry path, root) so tests run it on fixtures in temporary directories. Dropped the type-bridge and unstable-API registries and the comparison of the unstable-API policy with `tsconfig.json` (`unstablePolicy.ts`, `syncEffectPolicy.ts` are not copied). |
| `effect-exceptions.json` | `effect-exceptions.json` | Starts with an empty `exceptions` list and no `typeBridges` or `unstableApis`. |
| `effectFamily.ts` | `effectFamily.ts` | None. |
| `diagnosticRules.ts` | `diagnosticRules.ts` | None. |
| `package.json`, `tsconfig.json`, `vite.config.ts` | same names | Package name `@reebeat/quality`; the donor's `tsconfig.json` is unchanged. |
| `test/effectFamily.test.ts` | `test/effectFamily.test.ts` | Added the "one version passes" case and the case that changes one entry of the real `bun.lock`. |
| `test/diagnosticCoverage.test.ts` | `test/diagnosticCoverage.test.ts` | None. |
| `test/effectExceptions.test.ts` | none | New: unregistered, registered, stale, missing-file, other-directive, duplicate and ignored-text cases on temporary fixtures. |

Not copied: `checkStoreBoundary.ts`, `storeBoundary.ts`, `storeBoundaryCheck.ts` and their tests (the store-boundary check is out of scope in spec 0000), `test/authPool.test.ts`.
