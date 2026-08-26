---
name: design-test
description: Judge a rendered user interface across every standard format before it is committed. Use before ANY commit that touches something with a visible surface — markup, CSS, template, component, layout, font, colour, text, image, print style — and at the end of every design-relevant feature or bugfix.
---

# Design test

Judge what the user SEES, never what the source says. A coding mistake is no
excuse: it would have been visible in the picture.

A passing test suite proves nothing here. It confirms that a button exists,
never that its label is unreadable, that two lines collide at 800 pixels, or
that a third of the screen stays empty.

## 1. Render

```bash
docker run --name scan -e TARGET_URL=<url> mwaeckerlin/webdesign-scanner
docker cp scan:/out ./out
docker rm scan
```

Each run uses a fresh container, so the results are always the results of
this run. Remove the container at the end, otherwise the next run finds the
name taken.

Nothing of the host is mounted into the container — that is deliberate, a run
must not be able to touch a working copy. The results leave through
`docker cp`, which writes them as the calling user.

**Full catalogue by default — 26 viewports, A3, A4, A5 and Letter upright and
sideways.** That is the state that counts, and it is what a commit is judged
against.

**A short run is allowed only as an intermediate check** while you are still
working on one detail:

```bash
  -e VIEWPORTS=full-hd,tablet-portrait,phone-medium -e PRINT=false
```

**Before a commit, and after any structural change to a layout, the full run
is mandatory.** A reduced run proves nothing about the widths it skipped, and
those are where a layout breaks.

The images land in `out/screen` and `out/print/png`, the machine-readable
index in `out/meta/manifest.json`, the short human summary in
`out/meta/summary.md`.

If the page needs a login or a particular state, describe the way there in a
workflow file and pass it as `WORKFLOW_FILE`. The password comes from an
environment variable or a secret file, never from the workflow file itself.

Scanning a view of an app that already runs on the host and sits behind a
login is a recipe, not a wall: reach it over the host network so its
trusted-domain check passes, make every login step conditional (the workflow
re-runs per viewport, already authenticated), create a throw-away review
account, and disable one-time onboarding overlays for the run. A complete,
working stack is in [../host-login/](../host-login/); the network variants are
in the scanner's README under "Reaching the target url".

## 2. Judge every image, one by one

Open each PNG. Not a sample, not "looks plausible" — every one.

**Legibility and contrast**

- Every text readable at its real size, small print, labels, footers and text
  on images included.
- Foreground carrying against background, also over gradients, photos and
  video, also in an inverted or dark appearance.
- Colour never the only carrier of meaning.

**Typesetting**

- No overlapping or colliding lines.
- Line spacing neither cramped nor loose; line length still readable.
- No bad breaks, no orphaned single words, no clipped words.

**Spacing and alignment**

- Equal spacing between equal things; a spacing has exactly one source and
  never adds up from two.
- Clearly more space above a heading than below it.
- Everything that should share an edge shares it, at every width.

**Use of the available area**

- No large empty areas: the space is filled by a clever, dynamic distribution
  of the elements.
- Nothing squeezed either — where an arrangement no longer carries, it
  switches instead of compressing.
- Nothing sticking out of its area, nothing clipped, nothing scrolling
  sideways that should not.
- No empty area where content is expected.

**Every format**

- Each width has a coherent picture, the part widths and the breakpoints
  included.
- Phone and tablet, upright and sideways, judged on their own.
- Print pages breaking in sensible places, backgrounds present where
  intended, nothing running off the paper, margins even.

**Hierarchy, ergonomics, dynamics**

- The eye finds the most important thing first; at most three size steps; the
  strongest contrast exactly once per page.
- Controls recognisable as controls, large enough for a finger, in the
  expected order and position; the same function looking the same everywhere.
- Movement carries the interaction instead of delaying it; nothing jumps,
  flickers or shifts under the finger.
- States distinguishable: rest, hover, focus, active, disabled, error,
  loading, empty.

**Consistency**

- The same values for colour, spacing, radius, border and transition
  everywhere, from named variables, never as a one-off number.
- The same element looks the same on every page and comes from the same code.

## 3. Findings

- **Fix them, do not list them.** Finding one means doing it.
- **Correct the definition, never patch a single value.** If a spacing is
  wrong, the definition is wrong; a compensating number is forbidden.
- **Re-render after every fix and judge again at ALL formats.** A fix at one
  width very often breaks another.
- A finding that needs a design decision from the owner is named as a
  blocker, together with the image that shows it.

## 4. Done

Done means every captured image of the **full** catalogue satisfies every
point above. A short intermediate run never closes the check. Report what was
checked — url, number of viewports and paper formats, number of images — and
what was corrected as a result.

A script cannot decide whether a design carries. Contrast values, horizontal
overflow and missing alternative texts are measurable and worth automating;
whether a page is legible, balanced and well distributed is a judgement, made
fresh each time by whoever looks at the images.
