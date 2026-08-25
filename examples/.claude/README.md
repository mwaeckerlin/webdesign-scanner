# A ready-made `.claude` for the design check

Copy what is here and your assistant renders every change with a visible
surface in all standard formats and judges the images before you commit.

## Copy it

```bash
cp -r examples/.claude/skills/design-test ~/.claude/skills/
```

Then two small edits by hand:

1. **Append `CLAUDE.md`** — take the paragraph from
   [CLAUDE.md](CLAUDE.md) into your own `~/.claude/CLAUDE.md`. Without it the
   skill exists but nothing obliges the assistant to use it.
2. **Merge `settings.json`** — take the entries from
   [settings.json](settings.json) into the `permissions.allow` list of your
   `~/.claude/settings.json`. Without them every run stops and asks, and a
   check that interrupts you is a check you switch off.

The skill runs the published image directly, so nothing has to be cloned or
built. It passes `-u $(id -u):$(id -g)`, which makes the results belong to
you instead of to root.

For a single project, put the same three things in `<project>/.claude/`
instead of `~/.claude/`; they then apply there only.

## How the three pieces work together

| File | Loaded | Role |
| --- | --- | --- |
| `CLAUDE.md` | on **every** request | the obligation. One paragraph, no procedure — every line here costs context forever |
| `skills/design-test/SKILL.md` | **on demand**, when its `description` matches the situation | the procedure: render command, output paths, full checklist |
| `settings.json` | at start | the permissions, so the run never stops to ask |

The `description` is the load-bearing part of the skill. The assistant sees
every skill's name and description and decides for itself when one applies,
so the description states the **trigger** — «before any commit that touches
something with a visible surface» — instead of the capability. A description
that says what the skill *does* is never matched against a situation, and the
skill stays unused.

What then makes the check real is that the assistant **opens the PNGs**. Its
file tool passes them to the model as images, so the model sees the rendered
pixels — the collision, the empty third, the label too pale to read — and
compares them against the checklist it has just loaded. It measures nothing;
it looks, at thirty screens nobody would open by hand.

## Three things that decide whether it works

1. **The assistant must be able to open the images.** It judges the design by
   looking at the PNGs. If the results land outside the directories it may
   read, it falls back to reading the manifest and summarising it — which
   looks like a design review and is not one. `npm run results` copies them
   to `out/` in the project, which satisfies this by default. Put `out` in
   your `.gitignore`.
2. **The run must not ask for permission every time.** That is what
   `settings.json` above is for.
3. **The full catalogue decides.** The skill renders all 26 viewports and all
   four paper formats by default. A reduced run is allowed while you are
   still working on one detail; before a commit and after any structural
   change the full run is mandatory, because a reduced run proves nothing
   about the widths it skipped.

## Add it to your commit routine

If you drive commits through a command file (for example
`~/.claude/commands/commit.md`), add one line to its review section, next to
the test run:

```markdown
- **Design test:** if the change touches anything with a visible surface, run
  the skill `design-test` — render all standard formats and judge every image
  before committing. Fix findings and re-render; never list them.
```

That is the last gate before the commit happens, and therefore the place
where the check cannot be skipped.

## Calling it by hand

```text
/design-test
```
