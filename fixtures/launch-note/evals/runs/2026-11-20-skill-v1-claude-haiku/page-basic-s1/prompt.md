Use the launch-note skill: read .agents/skills/launch-note/SKILL.md first and follow it, including the references it points to.
This is a benchmark run and nobody will answer a question: where you would ask, make the reasonable choice and record it in notes.md.
Do not use MCP tools or the network, and do not read anything outside this directory.
Input files the request names: files/brief.md.

Request:
Write the launch page for the release described in brief.md. Save it as outputs/index.html.

Write every file you produce under outputs/. A text deliverable goes in outputs/output.md as Markdown unless the request names another file or format.
Working files that are not part of the answer (scripts, crops, trial renders) go under scratch/ in this directory, never under outputs/ and never in /tmp or any other folder outside this directory.
When the request is for an interface and what you write does not open in a browser by itself (a React component, for one), also write outputs/preview.html: one page that shows it working in a browser with no network, its scripts and styles inline or in files beside it under outputs/.
Write everything else you would tell the user (what needs checking, choices you made, caveats) to notes.md in this directory, not under outputs/.
Reply with one line when the files are written.
