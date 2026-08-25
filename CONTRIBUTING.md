# Contributing

## What belongs where

| Path | Content |
| --- | --- |
| `src/` | the tool, TypeScript, compiled to `dist/` |
| `examples/` | a complete configuration and complete workflows, all validated by tests |
| `tests/unit/` | arithmetic and validation, run with vitest on the host |
| `tests/e2e/` | complete runs of the delivered image through Docker Compose |
| `tests/e2e/site/` | the pages the scenarios run against |
| `tests/e2e/fixtures/` | one configuration per scenario, plus the test workflows |

## Rules that shaped the code

- **The layout of the source follows the pipeline.** Configuration, viewport
  arithmetic, scroll arithmetic, workflow parsing, workflow execution,
  capture, print, manifest — each in one module, each with as little state as
  possible. Everything that can be a pure function is one, so it can be
  tested without a browser.
- **Everything that runs inside the page lives in `browser-scripts.ts`.**
  Those functions are serialized and executed by the browser: they must not
  import anything and must not close over anything outside their argument.
- **Nothing is written without going through the secret registry.** Log
  lines, the manifest, the summary and error messages all pass `mask()`. A
  new output path that bypasses it is a defect, even when it happens to carry
  no secret today.
- **A failure never leaves a partial result set.** Whatever aborts a run, the
  screenshots and the print output produced so far are thrown away. Only the
  error report, the summary and the debug screenshots remain.
- **A limit is never silent.** Every safety limit that applies is logged and
  recorded in the manifest and the summary, with what was wanted and what was
  captured.

## Working on it

    npm install
    npm run compile        # type check and build dist/
    npm run test:unit      # type check the tests, then run them
    npm test               # everything: docs, unit, image and e2e

`npm test` needs Docker. The end to end scenarios build the image, start the
test site and run the delivered container once per scenario.

## Adding a feature

1. Give it the next free number in [FEATURES.md](FEATURES.md). Numbers are
   never reused.
2. Write the test first and watch it fail — an end to end scenario for
   anything a user can observe, a unit test for arithmetic and validation.
3. Implement it.
4. List every new test in [TESTS.md](TESTS.md) with its feature number.
   `tests/docs-contract.sh` fails when a test exists in the sources but not
   in the register, so this is not optional.
5. Update the README and the CHANGELOG.

## Adding a workflow action

1. Add its allowed keys to `ACTION_KEYS` in `src/workflow.ts` and a variant
   to the `Step` union.
2. Parse it in `parseStep`, execute it in `WorkflowRunner.perform`.
3. Add it to the reference workflow `examples/workflow-forms-frames-tabs.yaml`
   — a unit test fails when an action is missing there.
4. Document it in the README table.

## Adding a viewport

Add it to `BUILTIN_VIEWPORTS` in `src/viewports.ts`, in the order it should
appear, and extend the catalogue test and the README table. The first entry
wins when two entries render identically, so order matters.

## Release

Raise the patch version in `package.json`, add a CHANGELOG entry from the
point of view of the person using the tool, run `npm test`, commit.
