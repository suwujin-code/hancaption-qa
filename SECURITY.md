# Security policy

## Supported versions

Security fixes are provided for the latest minor release. During the initial `0.x` period, upgrade to the newest published version before reporting a problem.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature for this repository. Do not open a public issue containing credentials, unpublished subtitles, private media, internal paths, or exploitable details.

Include:

- affected version and operating system;
- minimal reproduction steps using synthetic data;
- expected and observed impact;
- whether the issue can expose report contents or read/write files outside the requested paths.

## Data boundary

HanCaption QA is designed to run locally without telemetry or network requests. Reports can contain original subtitle text, filenames, and timestamps. Users are responsible for choosing a safe report destination and reviewing artifacts before publishing them.

The project does not need API keys. A request to enter an API key into HanCaption QA should be treated as suspicious.
