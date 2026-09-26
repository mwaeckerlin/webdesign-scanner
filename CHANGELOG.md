# Changelog

- 2026-09-26 **1.0.3**
    - The image is published for amd64 and arm64 under one tag, built and published automatically on every change and every week

- 2026-08-26 **1.0.2**
    - The shortest way to run it copies the results out of the container instead of mounting a directory into it, so a run reaches nothing on your machine at all
        - both ways are documented, with the reasons the copy is the default: an untrusted page rendered in the browser gets no writable path outward, the files belong to you without further options, and off Linux a copy is faster than a mount
    - Reaching a local app that only answers to its own domain is now explained: applications that check a trusted domain (Nextcloud, Django, Rails and the like) return an error page when reached through `host.docker.internal`, and the scan captured that error page instead of the site; sharing the host network reaches the published port under the name the app trusts
    - The password file the login example asks you to create can no longer be committed by accident, and a test keeps it that way
    - A complete, working example scans a running app behind a login over the host network — with the login steps made conditional so the workflow can re-run per viewport, and a note on the throw-away review account and the one-time onboarding overlays that have to be handled around the run

- 2026-08-25 **1.0.1**
    - The README explains how an AI agent actually uses the tool: which file is loaded when, why the skill description has to name the trigger rather than the capability, and that the agent opens the images and judges the pixels instead of reading a report about them
    - The shortest way to use it is one `docker run` against the published image, with the results belonging to the calling user instead of to root — no clone, no build
    - The design check renders the full catalogue by default; a reduced run is an intermediate check while working on a detail, and before a commit or after a structural change the full run is mandatory
    - A ready-made configuration for an AI assistant comes with the tool: copy one directory and the design check runs before every commit, with the checklist, the rule that makes it mandatory and the permissions that keep a run from interrupting
    - The README is ordered by what a reader needs first and opens with a table that leads straight to the one thing he is looking for; the long reference parts moved behind the parts everybody needs
    - The README opens with a picture of what the tool delivers — the same page from an ultrawide down to a phone — and says in the first lines what it is for, what it saves and where to go next
    - The README explains how to make the design check a fixed step before every commit, with the checklist to judge the images against and everything needed to set it up in an AI assistant
        - the complete skill file to copy, the rule that makes it mandatory, the permissions that keep a run from interrupting, and the reduced run that is small enough for every commit
        - it also names the condition that decides whether any of it works: the assistant has to be able to open the images, because an assistant that only reads the manifest produces something that looks like a design review and is not one
    - The ultrawide viewport is now the size people actually buy, 3440 × 1440, and the entry size 2560 × 1080 is captured alongside it
        - the two sit on opposite sides of the breakpoint a responsive layout typically places there, so a site that shows three columns on the one and six on the other is no longer reviewed from one side only

- 2026-08-25 **1.0.0**
    - First release: render any website in many window sizes and paper formats and collect everything an AI needs for a design review
        - one image of what a visitor sees first, a complete series over every scroll position, one image of the whole page, and a separate series for every inner area that scrolls on its own
        - window sizes for 4:3, 16:9, 16:10 and 21:9 desktops, HD, Full HD and UHD, tablets upright and sideways and small, medium and large phones — plus the half, third and two-third widths of a monitor, where responsive layouts usually break first
        - print output as PDF in A3, A4, A5 and US Letter, upright and sideways, with every printed page additionally rendered as an image
    - Pages behind a login can be reviewed: navigation, cookie banners, forms, frames and new tabs are described in a workflow file, and the run stops rather than reviewing the wrong page when the closing check fails
        - passwords never have to stand in that file; they come from the environment or from a secret file and are masked in every log line, report and error message
        - the authenticated session is kept out of the results even when the configured path only looks as if it pointed elsewhere
    - Every result carries a manifest that says which file shows which state, and a short summary for people
        - it also records how the run was isolated: the container is the boundary, and the browser's own sandbox can be switched on as a second layer where the host allows it
    - Existing results are never silently replaced, and a run that fails leaves no material behind that could be mistaken for a finished analysis
        - stopping a run with ctrl-c is reported as the interruption it is, naming the signal, instead of looking like a defect of the tool
    - Problems of the page are named with the address they concern, so a warning can be judged from the log without opening the manifest
    - The README explains how to have the material analysed by ChatGPT or Claude, with a context template and ready to use prompts, and states plainly what such an analysis can and cannot show
