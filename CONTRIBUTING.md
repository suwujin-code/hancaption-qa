# Contributing

Thank you for helping make AI-generated captions easier to review.

## Before opening an issue

- Remove private names, customer material, unpublished media, credentials, and internal paths.
- Prefer a minimal synthetic subtitle fixture that reproduces the problem.
- Explain the expected behavior and which editor, ASR engine, or format produced the input.
- If proposing a threshold, include an authoritative reference or real workflow evidence. Do not present personal preference as a universal standard.

## Development workflow

1. Fork the repository and create a focused branch.
2. Add or update a synthetic fixture and a failing test.
3. Implement the smallest change that makes the test pass.
4. Run `npm run check` and `npm run pack:check`.
5. Open a pull request describing user impact, compatibility, and privacy considerations.

Runtime dependencies require a clear security, maintenance, and bundle-size justification. Zero dependencies is the default.

## Language and transcription changes

Rules that infer language, dialect, or meaning need extra care. A structural warning should not silently rewrite user text. Human-approved replacement text and machine-generated suggestions must remain distinguishable.

By contributing, you agree that your contribution is licensed under Apache-2.0.
