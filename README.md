# HanCaption QA

[![CI](https://github.com/suwujin-code/hancaption-qa/actions/workflows/ci.yml/badge.svg)](https://github.com/suwujin-code/hancaption-qa/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Offline-first quality checks for Chinese and AI-generated subtitles.**
面向中文和 AI 自动转录工作流的离线字幕质量门禁，并为可能的粤语文本提供有限的人工复核提示。

HanCaption QA finds timing, readability, layout, duplication, encoding, and word-animation risks in SRT, WebVTT, ASS, and segment-based AI JSON files. It reads subtitle text and timing locally. It does not upload media, call an AI service, or rewrite source text.

HanCaption QA 检查字幕时间轴、阅读速度、行宽、重复、编码和逐字动画风险。所有检查均在本地完成；工具不会上传视频或音频，不会调用 AI 服务，也不会擅自改写原字幕。

## Why this exists / 为什么做这个

AI transcription can produce structurally valid files that are still unsafe to publish: zero-duration words, overlapping cues, duplicated phrases, text that appears too quickly, or phrase-level timestamps incorrectly treated as word-level timing.

通用字幕转换工具已经很多。HanCaption QA 专注于另外一个问题：**AI 生成的中文字幕是否具备可发布的结构证据**。如果输入只有 VAD/短语级时间戳，报告会拒绝授权逐字动画；如果文本来自机器转录或有限规则发现可能的粤语标记，报告会保留原文并要求人工复核，而不是自动“纠正”语义。这个字符规则只是提示，不是粤语识别器，也不证明语言或语义正确。

## Features / 功能

- Parses SRT, WebVTT, ASS/SSA, and segment-based JSON.
- Recognizes common segment-based AI JSON fields such as `segments`, `captions`, `sentences`, `words`, and `tokens`; the exact timing contract is documented in [Rule reference](docs/rules.md).
- Detects invalid timestamps, non-positive durations, overlaps, adjacent duplicates, empty captions, encoding replacement characters, long lines, too many lines, and high reading speed.
- Separates text-review status from word-animation safety.
- Produces text, JSON, HTML, and SARIF reports.
- Provides `general` and `short-video` editorial profiles.
- Runs with Node.js only and has zero runtime dependencies.
- Includes a composite GitHub Action for pull-request checks.

The default thresholds are practical editorial defaults, **not universal broadcast standards**. They can evolve through documented issues and real-world evidence.

## Quick start / 快速开始

Run from a cloned repository:

```bash
npm install
node src/cli.js examples/problematic.srt --profile short-video --fail-on never
```

Install the signed-off GitHub release package:

```bash
npm install --global https://github.com/suwujin-code/hancaption-qa/releases/download/v0.1.0/hancaption-qa-0.1.0.tgz
```

Install from npm after the registry package is published:

```bash
npm install --global hancaption-qa
hancaption captions.srt --profile short-video
```

Read from standard input:

```bash
cat captions.vtt | hancaption - --input-format vtt --format json
```

Generate a shareable HTML report:

```bash
hancaption captions.srt --format html --output report.html --fail-on never
```

Audit machine-generated JSON and require a human text review:

```bash
hancaption whisper.json --machine-generated --format sarif --output hancaption.sarif
```

Exit codes:

- `0`: the selected failure threshold was not reached;
- `1`: findings reached `--fail-on error` or `--fail-on warning`;
- `2`: invalid CLI arguments, unreadable input, or parse failure.

## GitHub Action

```yaml
name: Caption QA
on: [pull_request]

jobs:
  captions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: suwujin-code/hancaption-qa@v0.1.0
        with:
          path: subtitles/final.srt
          profile: short-video
          fail-on: error
```

The action checks the file inside the runner. It does not transmit subtitle or media content to this project. Set `machine-generated: true` for plain SRT/VTT/ASS files created by ASR.

## JavaScript API

```js
import { parseCaptions, auditCaptions } from "hancaption-qa";

const parsed = parseCaptions(srtText, { filename: "captions.srt" });
const report = auditCaptions(parsed, { profile: "short-video" });

console.log(report.summary);
```

The stable report schema for the first release is `hancaption-qa/report-v1`.

## What the tool does not do / 明确边界

- It does not transcribe audio or download model weights.
- It does not upload local files.
- It does not claim that a structurally valid transcript is semantically correct.
- It does not automatically convert Cantonese into written Mandarin.
- It does not authorize word animation without usable word timings.
- It does not replace professional accessibility, localization, legal, or broadcaster review.

## Development

```bash
npm install
npm run check
npm run demo
npm run pack:check
```

See [Rule reference](docs/rules.md), [Roadmap](docs/roadmap.md), [Contributing](CONTRIBUTING.md), and [Security policy](SECURITY.md).

## Privacy and data handling

The CLI has no network code and no telemetry. Reports may contain subtitle text, the input file's basename, and timing information. Absolute source paths are reduced to basenames by default. Treat generated reports according to the sensitivity of the source material, and review them before attaching them to a public issue or pull request.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
