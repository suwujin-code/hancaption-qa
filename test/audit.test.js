import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { auditCaptions, parseCaptions, shouldFail } from "../src/index.js";

const fixture = (name) => new URL(`fixtures/${name}`, import.meta.url);

test("clean SRT has no errors", async () => {
  const input = await fs.readFile(fixture("clean.srt"), "utf8");
  const report = auditCaptions(parseCaptions(input, { filename: "clean.srt" }));
  assert.equal(report.summary.error, 0);
  assert.equal(shouldFail(report), false);
  assert.equal(report.summary.wordAnimationAllowed, false);
});

test("reports invalid duration, overlap, speed and duplicates", async () => {
  const input = await fs.readFile(fixture("problematic.srt"), "utf8");
  const report = auditCaptions(parseCaptions(input, { filename: "problematic.srt" }), { profile: "short-video" });
  const codes = new Set(report.findings.map((item) => item.code));
  assert.ok(codes.has("NON_POSITIVE_DURATION"));
  assert.ok(codes.has("CAPTION_OVERLAP"));
  assert.ok(codes.has("READING_SPEED"));
  assert.ok(codes.has("ADJACENT_DUPLICATE"));
  assert.equal(shouldFail(report), true);
});

test("valid word timestamps allow word animation but still require text review", async () => {
  const input = await fs.readFile(fixture("whisper.json"), "utf8");
  const report = auditCaptions(parseCaptions(input, { filename: "whisper.json" }));
  assert.equal(report.summary.wordAnimationAllowed, true);
  assert.equal(report.summary.textReviewRequired, true);
});

test("invalid word timing disables word animation", () => {
  const parsed = parseCaptions(JSON.stringify({
    source: "ai-asr",
    segments: [{ start: 0, end: 1, text: "测试", words: [{ word: "测试", start: 0.4, end: 0.4 }] }],
  }), { filename: "input.json" });
  const report = auditCaptions(parsed);
  assert.equal(report.summary.wordAnimationAllowed, false);
  assert.ok(report.findings.some((item) => item.code === "INVALID_WORD_TIME"));
});

test("word text mismatch blocks word animation", () => {
  const parsed = parseCaptions(JSON.stringify({
    segments: [{ start: 0, end: 1, text: "甲", words: [{ word: "乙", start: 0, end: 1 }] }],
  }), { filename: "input.json" });
  const report = auditCaptions(parsed);
  assert.equal(report.summary.wordAnimationAllowed, false);
  assert.ok(report.findings.some((item) => item.code === "WORD_TEXT_MISMATCH" && item.severity === "error"));
});

test("empty text blocks word animation even with valid words", () => {
  const parsed = parseCaptions(JSON.stringify({
    segments: [{ start: 0, end: 1, text: "", words: [{ word: "乙", start: 0, end: 1 }] }],
  }), { filename: "input.json" });
  const report = auditCaptions(parsed);
  assert.equal(report.summary.wordAnimationAllowed, false);
});

test("negative JSON timestamps are errors", () => {
  const parsed = parseCaptions(JSON.stringify({ segments: [{ start: -1, end: 1, text: "负时间" }] }), { filename: "input.json" });
  const report = auditCaptions(parsed);
  assert.ok(report.findings.some((item) => item.code === "NEGATIVE_TIMESTAMP"));
  assert.equal(shouldFail(report), true);
});

test("empty and unparsed inputs fail closed", () => {
  const empty = auditCaptions(parseCaptions("", { filename: "empty.srt" }));
  const garbage = auditCaptions(parseCaptions("not a subtitle", { filename: "garbage.srt" }));
  assert.ok(empty.findings.some((item) => item.code === "NO_CAPTIONS"));
  assert.ok(garbage.findings.some((item) => item.code === "UNPARSED_BLOCK" && item.severity === "error"));
  assert.equal(shouldFail(empty), true);
  assert.equal(shouldFail(garbage), true);
});

test("Cantonese markers request review without rewriting source text", () => {
  const parsed = parseCaptions("1\n00:00:00,000 --> 00:00:02,000\n唔好为咗平就乱拣料", { filename: "yue.srt" });
  const report = auditCaptions(parsed);
  assert.ok(report.findings.some((item) => item.code === "POSSIBLE_CANTONESE_MARKERS"));
  assert.equal(report.summary.textReviewRequired, true);
  assert.equal(parsed.captions[0].text, "唔好为咗平就乱拣料");
});
