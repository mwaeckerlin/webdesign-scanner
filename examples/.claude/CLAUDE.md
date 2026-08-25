# Instructions

Add this paragraph to your own `CLAUDE.md`. It is what turns the
`design-test` skill from available into mandatory — an assistant applies a
skill it merely *has* only when it happens to think of it.

---

Before every commit that touches something with a visible surface — markup,
CSS, template, component, layout, font, colour, text, image, print style —
and at the end of every design-relevant feature or bugfix, run the skill
`design-test`. In doubt, run it. A passing test suite is never a substitute:
it says nothing about how the page looks.

Findings from that run are fixed and re-rendered, never listed. A finding
that needs a design decision is named as a blocker, with the image that shows
it.
