# Changelog

- 2026-08-25 **1.0.0**
    - First release: render any website in many window sizes and paper formats and collect everything an AI needs for a design review
        - one image of what a visitor sees first, a complete series over every scroll position, one image of the whole page, and a separate series for every inner area that scrolls on its own
        - window sizes for 4:3, 16:9, 16:10 and 21:9 desktops, HD, Full HD and UHD, tablets upright and sideways and small, medium and large phones — plus the half, third and two-third widths of a monitor, where responsive layouts usually break first
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
