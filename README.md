# csv-reader-speed entry

A fast, dependency-free CSV reader for the make.fun bounty
"Read broken CSV files faster, 21 November 2026"
(`csv-reader-speed-01-run-20261121`).

`run(input)` in `solve.js` returns exactly what csv-reader 1.0.0 returns for
`{text, header}` — `{columns, rows, errors}` — including its broken-row policy
(stray CRs, quote junk, unterminated quotes, short/long rows, BOM, CRLF and
line breaks inside quoted fields). It is a fresh single-pass implementation
built for speed: bulk slicing (`indexOf`/`slice`) instead of per-character
string building, with character loops only on the rare broken paths.

`main.ts` is the house driver (unchanged): it reads `/input/cases.json`,
answers each case with `run`, and writes `/output/answers.json`. It sets
`--no-incremental-marking` before importing `solve.js`, as the baseline does.

## Files

- `solve.js` — the entry: `run(input) -> {columns, rows, errors}`
- `main.ts` — the driver
- `package.json` — `{"type": "module"}`
- `LICENSE` — MIT

## Local check

Practice set: 6/6 cases identical to the reference. Fuzzed against the
reference reader with 0 mismatches. See the build notes for timings.
