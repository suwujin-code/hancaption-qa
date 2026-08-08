import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { detectFormat, parseCaptions } from "../src/index.js";

const fixture = (name) => new URL(`fixtures/${name}`, import.meta.url);

test("parses SRT captions and preserves lines", async () => {
  const input = await fs.readFile(fixture("clean.srt"), "utf8");
  const result = parseCaptions(input, { filename: "clean.srt" });
  assert.equal(result.format, "srt");
  assert.equal(result.captions.length, 2);
  assert.equal(result.captions[0].startMs, 500);
  assert.equal(result.captions[0].endMs, 2_500);
  assert.equal(result.captions[0].text, "开源工具应该给出可验证的结果。");
});

test("parses WebVTT without an hour field", () => {
  const result = parseCaptions("WEBVTT\n\n00:01.000 --> 00:03.000\n字幕测试", { filename: "test.vtt" });
  assert.equal(result.captions[0].startMs, 1_000);
  assert.equal(result.captions[0].endMs, 3_000);
});

test("accepts legal WebVTT metadata headers without warnings", () => {
  const input = "WEBVTT\nKind: captions\nLanguage: zh\n\n00:00.000 --> 00:01.000\n你好";
  const result = parseCaptions(input, { filename: "test.vtt" });
  assert.equal(result.captions.length, 1);
  assert.deepEqual(result.diagnostics, []);
});

test("parses ASS dialogue and strips style tags", () => {
  const input = `[Script Info]\nTitle: Test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.20,Default,,0,0,0,,{\\b1}第一行\\N第二行`;
  const result = parseCaptions(input, { filename: "test.ass" });
  assert.equal(result.captions.length, 1);
  assert.equal(result.captions[0].startMs, 1_000);
  assert.equal(result.captions[0].endMs, 3_200);
  assert.equal(result.captions[0].text, "第一行\n第二行");
});

test("preserves commas in ASS dialogue text", () => {
  const input = `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.20,Default,,0,0,0,,第一句,第二句`;
  const result = parseCaptions(input, { filename: "test.ass" });
  assert.equal(result.captions[0].text, "第一句,第二句");
});

test("rejects minute and second values outside timestamp ranges", () => {
  const result = parseCaptions("1\n00:99:99,000 --> 00:99:99,500\n坏", { filename: "bad.srt" });
  assert.equal(result.captions[0].startMs, null);
  assert.equal(result.captions[0].endMs, null);
});

test("redacts absolute paths to basenames", () => {
  const result = parseCaptions("1\n00:00:00,000 --> 00:00:01,000\n安全", { filename: "/Users/example/private/captions.srt" });
  assert.equal(result.captions[0].source, "captions.srt");
});

test("redacts Windows-style paths to basenames", () => {
  const result = parseCaptions("1\n00:00:00,000 --> 00:00:01,000\n安全", { filename: "C:\\Users\\example\\private\\captions.srt" });
  assert.equal(result.captions[0].source, "captions.srt");
});

test("rejects non-object JSON caption items with a clear error", () => {
  assert.throws(
    () => parseCaptions("[null]", { filename: "input.json" }),
    (error) => error.code === "INVALID_JSON_ITEM" && /item 1/.test(error.message),
  );
});

test("does not mistake a WEBVTT-prefixed word for a WebVTT signature", () => {
  assert.equal(detectFormat("WEBVTTX\n\n00:00.000 --> 00:01.000\nhello", "input.txt"), "srt");
});

test("parses Whisper-style JSON and word timings", async () => {
  const input = await fs.readFile(fixture("whisper.json"), "utf8");
  const result = parseCaptions(input, { filename: "whisper.json" });
  assert.equal(result.provenance, "whisper");
  assert.equal(result.captions[0].words.length, 2);
  assert.equal(result.captions[0].words[1].endMs, 1_200);
});

test("detects content formats when the extension is unavailable", () => {
  assert.equal(detectFormat("WEBVTT\n"), "vtt");
  assert.equal(detectFormat("{\"segments\": []}"), "json");
  assert.equal(detectFormat("[Events]\n"), "ass");
});
