# Roadmap

This roadmap is evidence-driven. Items move into a release only after a reproducible issue or real integration demonstrates the need.

## v0.1 — trustworthy core

- SRT, WebVTT, ASS, and segment-based JSON parsing.
- Structural, reading-speed, layout, duplication, encoding, and word-timing checks.
- Text, JSON, HTML, and SARIF output.
- General and short-video profiles.
- Zero runtime dependencies and offline operation.
- GitHub Action and Node.js API.

## Candidate v0.2 work

- A documented configuration file with project-level overrides.
- Safer opt-in fixes that always preserve an input backup or write a new file.
- TTML parsing.
- Better ASS override-tag and karaoke timing support.
- Snapshot tests against community-contributed, redistributable fixtures.
- Optional Traditional/Simplified consistency hints backed by an auditable dictionary.

## Candidate v0.3 work

- A local desktop report viewer.
- Editor integrations for LocalCut, Remotion, Resolve/Premiere interchange, and other caption pipelines.
- Machine-readable provenance contract for ASR adapters.
- Additional language profiles maintained by community reviewers.

## Non-goals

- Hosting user media.
- Shipping speech-recognition model weights.
- Rewriting dialects without human approval.
- Becoming a full non-linear video editor.
- Claiming compliance with every broadcaster or jurisdiction through one default profile.
