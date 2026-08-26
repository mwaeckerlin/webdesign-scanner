# Tests

Register of every test, grouped by kind and sorted by the
[FEATURES.md](FEATURES.md) number it covers. `npm test` runs all of them.

The guard `tests/docs-contract.sh` fails when a feature has no test here,
when an entry refers to a feature that does not exist, when a test exists in
the sources but is missing from this register, or when any test carries a
marker that would switch it off. Tests are never skipped.

## E2E — the delivered image against real pages in a real browser

`tests/e2e/scenarios.test.ts` drives the published image through Docker
Compose exactly the way a user does, against a site served from
`tests/e2e/site/` by [mwaeckerlin/nginx]. Every scenario is a complete run;
the results are fetched out of the volume and inspected.

### Scenario `basic` — a long page with a fixed header and a print stylesheet

- **F1, F24** `tests/e2e/scenarios.test.ts` › reports success — a healthy page is captured completely and the job exits with 0.
- **F21** `tests/e2e/scenarios.test.ts` › writes the documented directory structure — screen, print/pdf, print/png, meta/manifest.json and meta/summary.md all exist.
- **F21** `tests/e2e/scenarios.test.ts` › names the tool, the target and the page it really reached — tool, status, requested url, final url and title.
- **F3, F4** `tests/e2e/scenarios.test.ts` › captures the configured viewports including the derived half width — the half width carries its dimensions, its origin and its fraction.
- **F6** `tests/e2e/scenarios.test.ts` › takes what a visitor sees the moment the page is ready, for every viewport — one first-view image per viewport, at the top of the page.
- **F3** `tests/e2e/scenarios.test.ts` › renders at the pixel density of the viewport — a desktop renders one to one, an emulated phone twice as dense.
- **F7** `tests/e2e/scenarios.test.ts` › walks the whole document in a scroll series that ends at the very bottom — ascending, without duplicates, ending at the true end position.
- **F7** `tests/e2e/scenarios.test.ts` › overlaps two neighbouring shots, so nothing falls between them — no gap exceeds the visible height.
- **F8** `tests/e2e/scenarios.test.ts` › produces one full page image per viewport — taller than the viewport, one per viewport.
- **F11** `tests/e2e/scenarios.test.ts` › gives every file a name that says what it shows — the documented pattern, and every name unique.
- **F21** `tests/e2e/scenarios.test.ts` › writes every file the manifest promises, in the size it promises — no entry without a file, no file without an entry.
- **F12, F13** `tests/e2e/scenarios.test.ts` › prints the configured paper format and renders every printed page — one pdf with several pages, one image per page, upright.
- **F22** `tests/e2e/scenarios.test.ts` › writes a summary a person can read — target, viewports and the note about css pixels.
- **F20** `tests/e2e/scenarios.test.ts` › reports no javascript error for a healthy page — the negative case of the diagnostics.
- **F19** `tests/e2e/scenarios.test.ts` › settles without a warning on a page that behaves — fonts, network and animations all settled, nothing had to be cut short.
- **F21, F24** `tests/e2e/scenarios.test.ts` › says whether the browser had a sandbox of its own — the security state of the run is recorded, not left to guesswork.

### Scenario `repeat` — the same page, captured a second time

- **F19** `tests/e2e/scenarios.test.ts` › reports success for the repeated run — a second, independent run of the same page.
- **F19** `tests/e2e/scenarios.test.ts` › produces an image identical to the earlier run, byte for byte — the stabilisation really makes two runs comparable, which is what a before and after comparison rests on.

### Scenario `existing` — a second run into the same directory

- **F23, F24** `tests/e2e/scenarios.test.ts` › stops with an output error — exit code 3 instead of a silent overwrite.
- **F23** `tests/e2e/scenarios.test.ts` › says what is in the way and how to proceed — names the result directories and the way to override.
- **F23** `tests/e2e/scenarios.test.ts` › leaves the earlier results completely untouched — same manifest, same artifacts, no error report dropped into it.

### Scenario `regions` — independently scrollable inner areas

- **F9** `tests/e2e/scenarios.test.ts` › reports success — a page full of inner scroll areas is captured completely.
- **F9** `tests/e2e/scenarios.test.ts` › finds every visible area that really scrolls — two independent areas, one nested and one sideways.
- **F9** `tests/e2e/scenarios.test.ts` › ignores an overflow box whose content fits, it would only duplicate — the negative case of the detection.
- **F9** `tests/e2e/scenarios.test.ts` › follows an area that is nested inside another one — captured with its nesting depth.
- **F9** `tests/e2e/scenarios.test.ts` › captures each area over its own positions, ending at its own bottom — a series per area, from its origin to its end.
- **F9** `tests/e2e/scenarios.test.ts` › follows a sideways area sideways — horizontal positions inside an inner area.
- **F9** `tests/e2e/scenarios.test.ts` › never multiplies the positions of two independent areas — the number of images stays a sum, never a product.
- **F9, F11** `tests/e2e/scenarios.test.ts` › records where the main document stood while an inner area was captured — in the manifest and in the file name.

### Scenario `lazy` — a document that grows while it is being captured

- **F7** `tests/e2e/scenarios.test.ts` › reports success — content that appears while scrolling does not break the run.
- **F7, F19** `tests/e2e/scenarios.test.ts` › extends the scroll series to the content that appeared during the run — more images than the document initially needed.
- **F7** `tests/e2e/scenarios.test.ts` › still ends at the true bottom of the grown document — the end position follows the growth.

### Scenario `wide` — a main document that scrolls sideways

- **F7** `tests/e2e/scenarios.test.ts` › reports success — a document wider than every viewport is captured.
- **F7** `tests/e2e/scenarios.test.ts` › captures the positions to the right as well — horizontal positions of the main document.
- **F11** `tests/e2e/scenarios.test.ts` › writes the horizontal position into the file name — the name carries both coordinates.

### Scenario `login` — a page behind a cookie banner and a login form

- **F15** `tests/e2e/scenarios.test.ts` › reports success — banner, login, navigation and the closing assertions all pass.
- **F15** `tests/e2e/scenarios.test.ts` › arrives at the page that was actually meant — final url and title of the page behind the login.
- **F15** `tests/e2e/scenarios.test.ts` › replays the workflow for every viewport — one recorded run per viewport.
- **F17** `tests/e2e/scenarios.test.ts` › signs in on the first viewport and re-uses the session on the next — the login steps are skipped the second time.
- **F14** `tests/e2e/scenarios.test.ts` › walks past a step that is allowed to fail — an optional step that cannot apply is recorded as skipped with a reason.
- **F15** `tests/e2e/scenarios.test.ts` › captures the page behind the login, not the login form — images exist and match the manifest.
- **F16** `tests/e2e/scenarios.test.ts` › never writes the password into the manifest — neither the manifest nor the summary contains it.
- **F16** `tests/e2e/scenarios.test.ts` › never writes the password into the log, not even in debug mode — the complete container output is checked.
- **F16, F17** `tests/e2e/scenarios.test.ts` › keeps the authenticated browser state out of the results — no cookies in the manifest, no state file in the output.

### Scenario `loginfail` — a workflow that does not reach the expected page

- **F18, F24** `tests/e2e/scenarios.test.ts` › stops with a workflow error — exit code 4 instead of a review of the wrong page.
- **F18** `tests/e2e/scenarios.test.ts` › names the step that failed — the error report carries the step label.
- **F18** `tests/e2e/scenarios.test.ts` › leaves nothing behind that looks like a finished analysis — no manifest, no screenshots, no print output.
- **F18, F22** `tests/e2e/scenarios.test.ts` › says in the summary that the capture failed — in plain words, not in a status field.
- **F18** `tests/e2e/scenarios.test.ts` › keeps a debug screenshot of the state at the moment of the failure — separated from the results, referenced in the report.
- **F16** `tests/e2e/scenarios.test.ts` › never writes the password into the error report or the log — masking holds on the failure path too.

### Scenario `limits` — every safety limit set so low that it has to apply

- **F10** `tests/e2e/scenarios.test.ts` › reports success but says what it could not cover — a limited run succeeds and records the limits.
- **F10** `tests/e2e/scenarios.test.ts` › names each limit, what was wanted and what was captured — every entry is complete.
- **F10** `tests/e2e/scenarios.test.ts` › actually honours the limit on the number of images — the limit is real, not decorative.
- **F10, F22** `tests/e2e/scenarios.test.ts` › repeats the limits in the summary, where a reader will see them — including the note that the capture is incomplete.
- **F10** `tests/e2e/scenarios.test.ts` › says it in the log as well — visible while the run happens.

### Scenario `printcss` — a document that brings its own paper size

- **F12** `tests/e2e/scenarios.test.ts` › reports success — print only, without screenshots.
- **F12** `tests/e2e/scenarios.test.ts` › lets the document decide when it is allowed to — the page size of the document wins over the configured format.
- **F12, F2** `tests/e2e/scenarios.test.ts` › produces print output even with screenshots switched off — the capture kinds are independent.

### Scenario `badconfig` — a misspelled option

- **F2, F24** `tests/e2e/scenarios.test.ts` › stops with a configuration error — exit code 2 before anything is rendered.
- **F2** `tests/e2e/scenarios.test.ts` › names the option and lists the ones it knows — the message is enough to fix the file.
- **F2, F18** `tests/e2e/scenarios.test.ts` › writes nothing at all — an unusable configuration leaves no output directory behind.

### Scenario `notfound` — an entry url that answers with an error page

- **F15, F24** `tests/e2e/scenarios.test.ts` › stops with a navigation error instead of reviewing the error page — exit code 5, with the http status in the message.
- **F18** `tests/e2e/scenarios.test.ts` › leaves no results behind — an error page is never captured as if it were the target.
- **F20** `tests/e2e/scenarios.test.ts` › records the failure for diagnosis — category and exit code in the error report.
- **F20** `tests/e2e/scenarios.test.ts` › names the url of the request that went wrong, in the log itself — a warning is judgeable without opening the manifest.

### Scenario `abort` — a slow run stopped from outside while it captures

- **F25, F24** `tests/e2e/scenarios.test.ts` › reports the abort with its own exit code — exit code 130, distinct from every failure category.
- **F25** `tests/e2e/scenarios.test.ts` › calls it an abort in the log, never an internal error — an interruption is not a defect of the tool.
- **F25** `tests/e2e/scenarios.test.ts` › records the abort as its own category, with the signal that caused it — the error report names the signal.
- **F25, F18** `tests/e2e/scenarios.test.ts` › leaves nothing behind that looks like a finished analysis — the half finished images are thrown away.
- **F25, F22** `tests/e2e/scenarios.test.ts` › says in the summary that the run was stopped, not that it broke — in plain words, without blaming the page.

### Scenario `envonly` — configured entirely through the environment

- **F2** `tests/e2e/scenarios.test.ts` › reports success — a run without any configuration file.
- **F2, F3, F12** `tests/e2e/scenarios.test.ts` › uses the viewports, formats and timings from the environment — viewport, paper format and orientation from environment variables.
- **F2, F21** `tests/e2e/scenarios.test.ts` › writes the effective configuration into the manifest — the run can be reproduced from it.

## Image contract tests

`tests/image-contract.sh` inspects the delivered image itself.

- **F24** `tests/image-contract.sh` › image_exists — the image was built.
- **F24** `tests/image-contract.sh` › runs_unprivileged — the container never runs as root.
- **F24** `tests/image-contract.sh` › entrypoint_is_the_scanner — the job starts without a command being given.
- **F2, F24** `tests/image-contract.sh` › no_url_is_a_configuration_error — a run without a target url exits with the configuration code.
- **F2** `tests/image-contract.sh` › no_url_is_explained — and says what is missing.
- **F1** `tests/image-contract.sh` › ships_node — the runtime is inside the image.
- **F13** `tests/image-contract.sh` › ships_pdftoppm — the pdf renderer is inside the image.
- **F12** `tests/image-contract.sh` › ships_pdfinfo — the pdf inspector is inside the image.
- **F1** `tests/image-contract.sh` › ships_the_browser — the browser is installed once for everyone.
- **F24** `tests/image-contract.sh` › no_build_tools_typescript — the compiler is not delivered.
- **F24** `tests/image-contract.sh` › no_build_tools_vitest — the test runner is not delivered.
- **F24** `tests/image-contract.sh` › output_directory_is_writable — the unprivileged user can write the results.

## Documentation contract tests

`tests/docs-contract.sh` keeps the registers and the sources in step.

- **F1** `tests/docs-contract.sh` › unique_feature_numbers — a feature number is never reused.
- **F1** `tests/docs-contract.sh` › every_feature_tested — no feature without a test.
- **F1** `tests/docs-contract.sh` › no_dangling_references — no test entry for a feature that does not exist.
- **F1** `tests/docs-contract.sh` › every_test_listed — no test in the sources that is missing from this register.
- **F1** `tests/docs-contract.sh` › no_unknown_test_files — no file named here that does not exist.
- **F1** `tests/docs-contract.sh` › no_skipped_tests — no marker anywhere that would switch a test off.
- **F1** `tests/docs-contract.sh` › readme_links_the_registers — the registers are reachable from the README.

## Unit tests

Optional in the sense that they never replace an end to end test; they pin
the arithmetic and the validation that would otherwise only be observable
through hundreds of images.

### Viewports — `tests/unit/viewports.test.ts`

- **F3** `tests/unit/viewports.test.ts` › covers every aspect ratio and device class the documentation promises — the catalogue is exactly what the README lists.
- **F3** `tests/unit/viewports.test.ts` › expands to the number of viewports the README promises — the advertised count and the catalogue cannot drift apart.
- **F3** `tests/unit/viewports.test.ts` › calls the ultrawide people actually buy by the plain name — `desktop-21-9` is 3440 × 1440, not the entry size.
- **F3** `tests/unit/viewports.test.ts` › carries the entry size of the same aspect ratio as well — 2560 × 1080 sits on the other side of a typical breakpoint and is captured too.
- **F3** `tests/unit/viewports.test.ts` › gives every entry a width, a height and a device class — no incomplete entry.
- **F3** `tests/unit/viewports.test.ts` › uses names that say what they are — names usable in a file name.
- **F4** `tests/unit/viewports.test.ts` › gives every desktop viewport its half width — the common way a window shares a monitor.
- **F4** `tests/unit/viewports.test.ts` › gives an ultrawide viewport a third and two thirds as well — how an ultrawide monitor is really split.
- **F4** `tests/unit/viewports.test.ts` › uses the documented aspect ratio as the threshold for ultrawide — the boundary case on both sides.
- **F4** `tests/unit/viewports.test.ts` › gives tablets and phones no part widths, they are not resizable windows — the negative case.
- **F4** `tests/unit/viewports.test.ts` › keeps the height and reduces only the width — a part width is a narrower window, not a smaller screen.
- **F4** `tests/unit/viewports.test.ts` › records where a part width came from — origin and fraction land in the manifest.
- **F4** `tests/unit/viewports.test.ts` › drops a part width that would be narrower than a real window — the lower bound, with a message.
- **F4** `tests/unit/viewports.test.ts` › produces no part widths at all when they are switched off — the setting really switches them off.
- **F5** `tests/unit/viewports.test.ts` › merges two entries that render identically and keeps the first name — including the alias.
- **F5** `tests/unit/viewports.test.ts` › keeps two entries of the same size that render differently — pixel density and touch make the difference.
- **F5** `tests/unit/viewports.test.ts` › merges a part width that collides with a full viewport — a derived entry never displaces a configured one.
- **F5** `tests/unit/viewports.test.ts` › produces no duplicate dimensions for the complete built-in catalogue — the shipped defaults are free of duplicates.

### Scroll arithmetic — `tests/unit/scroll.test.ts`

- **F7** `tests/unit/scroll.test.ts` › is the visible size minus the overlap — the step of a series.
- **F7** `tests/unit/scroll.test.ts` › never becomes zero, otherwise a series would not advance — the boundary case of a large overlap.
- **F7** `tests/unit/scroll.test.ts` › is a single position when everything fits — a page that does not scroll gets one image.
- **F7** `tests/unit/scroll.test.ts` › starts at the origin and ends at the exact last position — the two positions that must always be there.
- **F7** `tests/unit/scroll.test.ts` › advances by the visible size minus the overlap — the complete series of a concrete page.
- **F7** `tests/unit/scroll.test.ts` › produces no duplicate positions when the end falls on a step — no image twice.
- **F7** `tests/unit/scroll.test.ts` › covers the whole content: no gap between two shots exceeds the visible size — nothing falls between two images.
- **F10** `tests/unit/scroll.test.ts` › keeps the exact last position even when the limit cuts the series — the bottom of a page survives a limit.
- **F10** `tests/unit/scroll.test.ts` › reports how many positions the geometry would have needed — the number the manifest states.
- **F7** `tests/unit/scroll.test.ts` › keeps the positions already captured — growth does not invalidate what was done.
- **F7** `tests/unit/scroll.test.ts` › continues from the last captured position and ends at the new end — the extended series.
- **F7** `tests/unit/scroll.test.ts` › changes nothing when the document did not actually grow — no needless extra images.
- **F7** `tests/unit/scroll.test.ts` › produces no duplicates — extension never repeats a position.
- **F10** `tests/unit/scroll.test.ts` › respects the limit and still ends at the exact last position — limit and end position together.
- **F9** `tests/unit/scroll.test.ts` › is a single cell when nothing scrolls — a box that does not scroll gets one image.
- **F9** `tests/unit/scroll.test.ts` › combines both axes of the same box in reading order — the two axes of one box do belong together.
- **F10** `tests/unit/scroll.test.ts` › stops at the cell limit and says so — the limit per scrollable area.
- **F10** `tests/unit/scroll.test.ts` › reports a limit per axis separately — which axis was cut short.

### File names — `tests/unit/naming.test.ts`

- **F11** `tests/unit/naming.test.ts` › turns anything into a readable slug — a viewport name becomes a file name.
- **F11** `tests/unit/naming.test.ts` › pads a number to a fixed width so names sort correctly — a directory listing is in capture order.
- **F11** `tests/unit/naming.test.ts` › never produces a negative position in a name — the boundary case of a negative offset.
- **F11** `tests/unit/naming.test.ts` › carries viewport, dimensions, capture type, sequence and scroll position — everything the documentation promises.
- **F11** `tests/unit/naming.test.ts` › marks the first view and the full page image as such — the capture type is readable.
- **F11** `tests/unit/naming.test.ts` › names the inner region and the position of the main document as well — an inner area is identifiable.
- **F11** `tests/unit/naming.test.ts` › gives every position of a series its own name — no image overwrites another.
- **F11** `tests/unit/naming.test.ts` › keeps two regions of the same viewport apart — the area is part of the name.
- **F12** `tests/unit/naming.test.ts` › names a pdf after paper format and orientation — the print file is recognisable.
- **F13** `tests/unit/naming.test.ts` › numbers the rendered pages so they sort correctly — page 10 does not sort before page 2.

### Secrets — `tests/unit/secrets.test.ts`

- **F16** `tests/unit/secrets.test.ts` › replaces a registered value everywhere in a text — every occurrence, not only the first.
- **F16** `tests/unit/secrets.test.ts` › masks the value even when it was url encoded on the way — a password in a query string.
- **F16** `tests/unit/secrets.test.ts` › masks the value even when it was json encoded on the way — a password in a serialized error.
- **F16** `tests/unit/secrets.test.ts` › masks the base64 form, which is how basic authentication carries it — a password in a request header.
- **F16** `tests/unit/secrets.test.ts` › masks a longer secret first, so a shorter one cannot cut it in half — the overlapping case.
- **F16** `tests/unit/secrets.test.ts` › reaches every string of a nested structure, keys included — the whole manifest, not only its top level.
- **F16** `tests/unit/secrets.test.ts` › masks an error message without losing the error type — a masked error is still diagnosable.
- **F16** `tests/unit/secrets.test.ts` › ignores empty and missing values instead of masking everything — the boundary case that would destroy every log.
- **F16** `tests/unit/secrets.test.ts` › counts a registered secret once, however often it is added — the count in the log is honest.

### Matching — `tests/unit/match.test.ts`

- **F14** `tests/unit/match.test.ts` › compares literally in exact mode — the strictest mode.
- **F14** `tests/unit/match.test.ts` › looks for a fragment in contains mode — the mode for texts.
- **F14** `tests/unit/match.test.ts` › lets a star stop at a path separator — the documented glob behaviour.
- **F14** `tests/unit/match.test.ts` › lets a double star cross path separators — the pattern a login redirect needs.
- **F14** `tests/unit/match.test.ts` › lets a question mark stand for exactly one character — the third glob character.
- **F15** `tests/unit/match.test.ts` › anchors a glob, so a partial match is not enough — a closing assertion cannot pass by accident.
- **F14** `tests/unit/match.test.ts` › treats regular expression characters in a glob as ordinary text — a dot in a url is a dot.
- **F14** `tests/unit/match.test.ts` › uses a real regular expression in regex mode — the most powerful mode.
- **F14** `tests/unit/match.test.ts` › builds an anchored expression from a glob — the translation itself.
- **F15** `tests/unit/match.test.ts` › explains in words what it expected, for the failure message — a failed assertion is understandable.

### Configuration — `tests/unit/config.test.ts`

- **F2** `tests/unit/config.test.ts` › comes from TARGET_URL — the simplest way to run the tool.
- **F2** `tests/unit/config.test.ts` › comes from the configuration file when the environment says nothing — the file alone is enough.
- **F2** `tests/unit/config.test.ts` › is overridden by the environment — the documented precedence.
- **F2** `tests/unit/config.test.ts` › is required — a run without a target is refused.
- **F2** `tests/unit/config.test.ts` › must be a url — a typo is caught before the browser starts.
- **F2** `tests/unit/config.test.ts` › must use a scheme a browser can open — the negative case of an unsupported scheme.
- **F2** `tests/unit/config.test.ts` › rejects a misspelled option instead of ignoring it — the most expensive kind of configuration bug.
- **F2** `tests/unit/config.test.ts` › names the full path of the offending option — a nested typo names itself.
- **F2** `tests/unit/config.test.ts` › rejects a wrong type — a word where a number belongs.
- **F2** `tests/unit/config.test.ts` › rejects a value outside its range — the upper bound of the overlap.
- **F2** `tests/unit/config.test.ts` › rejects a value that is not one of the allowed words — and lists the allowed ones.
- **F2** `tests/unit/config.test.ts` › rejects a format version it does not understand — the versioning of the format.
- **F3** `tests/unit/config.test.ts` › rejects an unknown viewport name — and lists the known ones.
- **F12** `tests/unit/config.test.ts` › rejects an unknown paper format — and lists the known ones.
- **F12** `tests/unit/config.test.ts` › rejects a print viewport that is not configured — an impossible combination is caught early.
- **F2** `tests/unit/config.test.ts` › rejects a run that would capture nothing at all — a run without any output is a mistake.
- **F5** `tests/unit/config.test.ts` › rejects two viewports with the same name — names have to stay unique for the file names.
- **F16** `tests/unit/config.test.ts` › refuses to write the authenticated state into the results — credentials never land in the output directory.
- **F16** `tests/unit/config.test.ts` › sees through a detour that lands in the results after all — the guard compares resolved paths, so a detour through the parent directory is caught.
- **F16** `tests/unit/config.test.ts` › sees through a relative path that lands in the results after all — a relative path under a relative output directory is caught as well.
- **F16** `tests/unit/config.test.ts` › leaves a storage state next to the results alone — a directory beside the results stays a legitimate place for it.
- **F2** `tests/unit/config.test.ts` › reports a broken file instead of falling back to defaults — a broken file is never ignored.
- **F2** `tests/unit/config.test.ts` › reports a missing file — a wrong path is named.
- **F24** `tests/unit/config.test.ts` › classifies every configuration problem as a configuration error — the exit code of the category.
- **F3** `tests/unit/config.test.ts` › captures every built-in viewport with its part widths — the default without any configuration.
- **F12** `tests/unit/config.test.ts` › prints A3, A4, A5 and Letter in both orientations — the documented print default.
- **F23** `tests/unit/config.test.ts` › refuses to overwrite an existing result set — the safe default.
- **F24** `tests/unit/config.test.ts` › writes to /out — the documented output directory.
- **F24** `tests/unit/config.test.ts` › leaves the browser sandbox to the container, which every host can deliver — the default that works everywhere.
- **F24** `tests/unit/config.test.ts` › turns the browser sandbox on when it is asked to — the second layer stays available.
- **F15** `tests/unit/config.test.ts` › stops on an error page instead of analysing it — the safe default.
- **F12** `tests/unit/config.test.ts` › prints from full-hd where it is configured — the documented default reference viewport.
- **F12** `tests/unit/config.test.ts` › prints from the first configured viewport when full-hd is not among them — the fallback.
- **F3** `tests/unit/config.test.ts` › selects viewports — through the environment.
- **F12** `tests/unit/config.test.ts` › selects paper formats and orientations — through the environment.
- **F2** `tests/unit/config.test.ts` › switches whole capture kinds off — screenshots and print separately.
- **F2** `tests/unit/config.test.ts` › changes the settle time and the output directory — the two most common overrides.
- **F2, F4** `tests/unit/config.test.ts` › drops the derived part widths on request — the automatic half and third widths can be switched off.
- **F2, F15** `tests/unit/config.test.ts` › changes how long a slow site may take to answer — the navigation timeout is configurable and validated.
- **F2, F20** `tests/unit/config.test.ts` › changes how much the run says about itself — the log level is configurable and validated.
- **F2, F17** `tests/unit/config.test.ts` › takes an authenticated session in and writes one out — both storage state paths come from the environment.
- **F2** `tests/unit/config.test.ts` › rejects a value that is not a boolean — an environment variable is validated too.
- **F2** `tests/unit/config.test.ts` › rejects a value that is not a number — an environment variable is validated too.
- **F2** `tests/unit/config.test.ts` › accepts a json configuration file as well as yaml — both documented formats.

### Workflow format — `tests/unit/workflow.test.ts`

- **F14** `tests/unit/workflow.test.ts` › is versioned and refuses a version it does not understand — a file written today keeps its meaning.
- **F14** `tests/unit/workflow.test.ts` › covers every action the documentation lists — the register of actions and the README stay in step.
- **F14** `tests/unit/workflow.test.ts` › rejects an unknown action and lists the known ones — a typo names itself.
- **F14** `tests/unit/workflow.test.ts` › rejects an unknown option on a step — an ignored option would silently do nothing.
- **F14** `tests/unit/workflow.test.ts` › needs at least one step — an empty workflow is a mistake.
- **F24** `tests/unit/workflow.test.ts` › classifies a broken workflow as a configuration error — the exit code of the category.
- **F14** `tests/unit/workflow.test.ts` › is optional: without it the state after the last step is captured — the release is not mandatory.
- **F14** `tests/unit/workflow.test.ts` › is recorded when it is there — the explicit release.
- **F14** `tests/unit/workflow.test.ts` › must be the last step, because everything after it would never be captured — the negative case.
- **F14** `tests/unit/workflow.test.ts` › may appear only once — an ambiguous release is refused.
- **F14** `tests/unit/workflow.test.ts` › accepts role with an accessible name — the most robust way to address an element.
- **F14** `tests/unit/workflow.test.ts` › accepts label, placeholder, text, test id, alt text and title — every robust form.
- **F14** `tests/unit/workflow.test.ts` › accepts a css selector as the documented fallback — for markup that offers nothing better.
- **F14** `tests/unit/workflow.test.ts` › needs exactly one way of addressing — none and two are both refused.
- **F14** `tests/unit/workflow.test.ts` › refuses an accessible name without a role, which would silently do nothing — the trap that costs an hour.
- **F14** `tests/unit/workflow.test.ts` › narrows a match by text and by position — a row of a list.
- **F14** `tests/unit/workflow.test.ts` › scopes a match to a surrounding element — a button inside one specific row.
- **F16** `tests/unit/workflow.test.ts` › takes a plain string as a literal — a value that is not a secret.
- **F16** `tests/unit/workflow.test.ts` › reads a value from an environment variable and registers it as a secret — the usual way for a password.
- **F16** `tests/unit/workflow.test.ts` › reads a value from a secret file and strips the trailing newline — the way a docker secret arrives.
- **F16** `tests/unit/workflow.test.ts` › marks a literal explicitly when it looks like a reference — the escape for an ordinary value.
- **F16** `tests/unit/workflow.test.ts` › stops when the environment variable is missing instead of sending an empty password — the negative case that would lock an account.
- **F16** `tests/unit/workflow.test.ts` › stops when the secret file cannot be read — the negative case of a wrong path.
- **F16** `tests/unit/workflow.test.ts` › needs exactly one source — an ambiguous value is refused.
- **F16** `tests/unit/workflow.test.ts` › registers the secret of a fill step while parsing the workflow — masking is armed before the browser starts.
- **F14** `tests/unit/workflow.test.ts` › accepts a visibility condition — a step that only applies sometimes.
- **F14** `tests/unit/workflow.test.ts` › accepts a url condition with a match mode — a step that depends on where the browser is.
- **F14** `tests/unit/workflow.test.ts` › accepts a negated condition — the inverse of any condition.
- **F14** `tests/unit/workflow.test.ts` › needs exactly one condition — an ambiguous condition is refused.
- **F14** `tests/unit/workflow.test.ts` › marks a step as allowed to fail — a cookie banner that is not always there.
- **F14** `tests/unit/workflow.test.ts` › addresses a frame by name, by url or by the element it lives in — all three documented ways.
- **F14** `tests/unit/workflow.test.ts` › needs exactly one way of addressing a frame — an ambiguous frame is refused.
- **F14** `tests/unit/workflow.test.ts` › opens a new tab through the step that triggers it — a preview in a new window.
- **F14** `tests/unit/workflow.test.ts` › rejects a switch to a page that was never opened — the negative case, caught while parsing.
- **F14** `tests/unit/workflow.test.ts` › always knows the page the run started on — the main page never has to be opened.
- **F14** `tests/unit/workflow.test.ts` › picks by value, by visible label or by position — all three ways of selecting.
- **F14** `tests/unit/workflow.test.ts` › needs exactly one of them — an ambiguous selection is refused.
- **F14** `tests/unit/workflow.test.ts` › reads yaml — the documented main format.
- **F14** `tests/unit/workflow.test.ts` › reads json — the documented alternative.
- **F14** `tests/unit/workflow.test.ts` › reports a missing file instead of running without a workflow — a wrong path would produce a review of the login page.

### Manifest and summary — `tests/unit/manifest.test.ts`

- **F21** `tests/unit/manifest.test.ts` › names the tool and the manifest format — a reader knows what produced the file.
- **F21** `tests/unit/manifest.test.ts` › states the requested and the final url, the title and the time — where the images come from.
- **F21** `tests/unit/manifest.test.ts` › records whether the browser had its own sandbox — in the manifest and in the summary.
- **F21** `tests/unit/manifest.test.ts` › carries the effective configuration, so the run can be repeated — every value, not only the changed ones.
- **F21** `tests/unit/manifest.test.ts` › lists every viewport with its dimensions and where a part width came from — the viewport register of the run.
- **F21** `tests/unit/manifest.test.ts` › records the workflow status per viewport — proof that the workflow ran everywhere.
- **F21** `tests/unit/manifest.test.ts` › describes every artifact with its type, position and pixel size — the index an analysis works from.
- **F21** `tests/unit/manifest.test.ts` › names every warning and every limit that applied — an incomplete capture says so.
- **F16** `tests/unit/manifest.test.ts` › never carries a secret — the whole manifest goes through the masking.
- **F22** `tests/unit/manifest.test.ts` › says what was captured and where the manifest is — the entry point for a reader.
- **F22** `tests/unit/manifest.test.ts` › counts the artifacts by kind — the size of the material at a glance.
- **F22** `tests/unit/manifest.test.ts` › lists the viewports with their dimensions — the table a reader needs.
- **F22** `tests/unit/manifest.test.ts` › says that the numbers are css pixels, not window sizes — the misunderstanding that would follow otherwise.
- **F10, F22** `tests/unit/manifest.test.ts` › makes an incomplete capture visible instead of hiding it — the limits are in the summary.
- **F20, F22** `tests/unit/manifest.test.ts` › repeats the warnings and the problems the page had — what a reviewer has to know.
- **F22** `tests/unit/manifest.test.ts` › says what the material is good for and what it needs — the pointer to the analysis context.
- **F18** `tests/unit/manifest.test.ts` › states the category and the exit code — the failure report is machine readable too.
- **F18** `tests/unit/manifest.test.ts` › points at the debug screenshots — the way from the report to the picture.
- **F18** `tests/unit/manifest.test.ts` › says in plain words that nothing was kept — no doubt about what the directory holds.

### Output directory — `tests/unit/output.test.ts`

- **F24** `tests/unit/output.test.ts` › follows the documented structure — the paths the README names.
- **F24** `tests/unit/output.test.ts` › creates every directory a run needs — before anything is written.
- **F23** `tests/unit/output.test.ts` › sees nothing to protect in an empty directory — the normal first run.
- **F23** `tests/unit/output.test.ts` › sees nothing to protect in a directory that does not exist yet — the boundary case.
- **F23** `tests/unit/output.test.ts` › recognises results from every result directory — screenshots, print, manifest and debug alike.
- **F23** `tests/unit/output.test.ts` › ignores the empty result directories a prepared run leaves behind — an empty structure is no result.
- **F23** `tests/unit/output.test.ts` › finds a result file however deeply it is nested — a rendered pdf page counts as a result.
- **F23** `tests/unit/output.test.ts` › stops the run instead of mixing two states of a site — with the exit code of the category.
- **F23** `tests/unit/output.test.ts` › says how to proceed — the message names the way out.
- **F23** `tests/unit/output.test.ts` › replaces the previous results only when it was asked to — the explicit instruction works.
- **F23** `tests/unit/output.test.ts` › leaves files outside the result directories alone — nothing else in the volume is touched.
- **F18** `tests/unit/output.test.ts` › removes screenshots and print output but keeps the diagnosis — what a failed run leaves behind.

### Log output — `tests/unit/logging.test.ts`

- **F20** `tests/unit/logging.test.ts` › names the url, so a warning can be judged without opening the manifest — the visible line carries what the record carries.
- **F16** `tests/unit/logging.test.ts` › masks a secret that a url carries — a query string never leaks through a page event.
- **F20** `tests/unit/logging.test.ts` › stays on one line for an event that has no url — the exact format of an event without an address.
- **F20, F21** `tests/unit/logging.test.ts` › keeps the url in the record the manifest is built from — the log and the manifest say the same thing.

### Failure categories — `tests/unit/errors.test.ts`

- **F24** `tests/unit/errors.test.ts` › keeps a typed failure and the exit code of its category — a known failure keeps its meaning.
- **F24** `tests/unit/errors.test.ts` › calls an unexpected failure internal, so a real defect stays visible — the category of last resort.
- **F25** `tests/unit/errors.test.ts` › reports a run stopped from outside as an abort, never as an internal error — the defect a reader would otherwise hunt.
- **F25** `tests/unit/errors.test.ts` › names the signal that stopped it, in the message and in the details — the cause is readable and machine readable.
- **F25** `tests/unit/errors.test.ts` › lets the abort outrank the failure the abort itself provoked — the rejection caused by closing the browser is not the cause.
- **F24** `tests/unit/errors.test.ts` › gives every failure category an exit code of its own — the exit code identifies the category.

### Image sizes — `tests/unit/imageinfo.test.ts`

- **F21** `tests/unit/imageinfo.test.ts` › reports width and height — the size the manifest states.
- **F21** `tests/unit/imageinfo.test.ts` › reports the size of a large image without loading it — a UHD full page image stays cheap.
- **F21** `tests/unit/imageinfo.test.ts` › reports the file size in bytes — for estimating how much material an analysis gets.
- **F21** `tests/unit/imageinfo.test.ts` › refuses a file that is not a png instead of reporting nonsense — the negative case.

### The shipped examples — `tests/unit/examples.test.ts`

- **F2** `tests/unit/examples.test.ts` › is accepted by the very validation it documents — the example configuration really works.
- **F2** `tests/unit/examples.test.ts` › really lists every option at its default value — documentation and defaults cannot drift apart.
- **F14** `tests/unit/examples.test.ts` › parse, so a reader can start from them — the example workflows are valid.
- **F14** `tests/unit/examples.test.ts` › show every action of the format at least once — the reference workflow stays complete.
- **F16** `tests/unit/examples.test.ts` › keep the password out of the file itself — the examples teach the safe way.
- **F15, F16** `tests/unit/examples.test.ts` › parse the host login example, and keep its password out of it too — the shipped login stack is valid and reads its password from a secret file.
- **F16** `tests/unit/examples.test.ts` › keep the password file the host login example asks for out of git — the file the reader is told to create can never be committed by accident.
- **F26** `tests/unit/examples.test.ts` › ships a skill an assistant can pick up on its own — the description says when to apply it, not only what it does.
- **F26** `tests/unit/examples.test.ts` › tells the assistant to render before it judges — the skill runs the published image directly and hands the results to the calling user.
- **F26** `tests/unit/examples.test.ts` › demands the full catalogue before a commit — a reduced run is an intermediate check and never closes the design test.
- **F26** `tests/unit/examples.test.ts` › carries the whole checklist, so nothing is judged from memory — contrast, spacing, empty area, print, states and consistency are all named.
- **F26** `tests/unit/examples.test.ts` › ships the rule that makes the check mandatory — an available skill alone stays unused.
- **F26** `tests/unit/examples.test.ts` › ships permissions that keep a run from interrupting — a check that asks every time gets switched off.
- **F26** `tests/unit/examples.test.ts` › points only at files that are really there — every link in the shipped instructions resolves.
- **F2** `tests/unit/examples.test.ts` › are all present — the scenario configurations of the test stack exist.
- **F2** `tests/unit/examples.test.ts` › every scenario configuration is valid, except the one that is broken on purpose — one generated test per configuration file.

### The suite itself — `tests/unit/no-skipped-tests.test.ts`

- **F1** `tests/unit/no-skipped-tests.test.ts` › has tests in more than one place — the guard really sees the suite.
- **F1** `tests/unit/no-skipped-tests.test.ts` › every test file runs every test it contains — one generated test per test file, failing on any marker that switches tests off.

[mwaeckerlin/nginx]: https://github.com/mwaeckerlin/nginx "the web server the test site is served from"
