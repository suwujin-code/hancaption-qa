import path from "node:path";
import { parseTimestamp, secondsToMs } from "./time.js";

function makeCaption({ id, startMs, endMs, text, lines, words = null, source }) {
  return {
    id: String(id),
    startMs,
    endMs,
    text: String(text ?? "").trim(),
    lines: lines ?? String(text ?? "").split(/\r?\n/),
    words,
    source,
  };
}

function safeSourceName(filename) {
  if (filename === "stdin") return filename;
  return path.win32.basename(path.basename(String(filename)));
}

function parseTimedText(input, source, isVtt) {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  let body = normalized;
  if (isVtt && normalized.startsWith("WEBVTT")) {
    const headerEnd = normalized.indexOf("\n\n");
    body = headerEnd >= 0 ? normalized.slice(headerEnd + 2) : "";
  }
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const captions = [];
  const diagnostics = [];

  for (const [blockIndex, block] of blocks.entries()) {
    const rows = block.split("\n");
    const timingIndex = rows.findIndex((row) => row.includes("-->"));
    if (timingIndex < 0) {
      if (!isVtt || !/^(NOTE|STYLE|REGION)(?:\s|$)/.test(rows[0])) {
        diagnostics.push({ code: "UNPARSED_BLOCK", block: blockIndex + 1 });
      }
      continue;
    }
    const timing = rows[timingIndex].split(/\s+-->\s+/);
    const startRaw = timing[0];
    const endRaw = timing[1]?.split(/\s+/)[0];
    const startMs = parseTimestamp(normalizeVttTimestamp(startRaw));
    const endMs = parseTimestamp(normalizeVttTimestamp(endRaw));
    const textLines = rows.slice(timingIndex + 1);
    captions.push(makeCaption({
      id: timingIndex > 0 ? rows[timingIndex - 1] : blockIndex + 1,
      startMs,
      endMs,
      text: textLines.join("\n"),
      lines: textLines,
      source,
    }));
  }
  return { captions, diagnostics, format: isVtt ? "vtt" : "srt", provenance: null };
}

function normalizeVttTimestamp(value) {
  const text = String(value ?? "").trim().replace(".", ",");
  return /^\d{2}:\d{2}[,.]\d{3}$/.test(text) ? `00:${text}` : text;
}

function parseAss(input, source) {
  const lines = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  let inEvents = false;
  let fields = ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"];
  const captions = [];
  const diagnostics = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[Events\]$/i.test(trimmed)) {
      inEvents = true;
      continue;
    }
    if (/^\[/.test(trimmed) && !/^\[Events\]$/i.test(trimmed)) {
      inEvents = false;
      continue;
    }
    if (!inEvents) continue;
    if (/^Format:/i.test(trimmed)) {
      fields = trimmed.slice(trimmed.indexOf(":") + 1).split(",").map((field) => field.trim().toLowerCase());
      if (fields.at(-1) !== "text") {
        diagnostics.push({ code: "UNSUPPORTED_ASS_FORMAT", message: "ASS Text field must be last." });
      }
      continue;
    }
    if (!/^Dialogue:/i.test(trimmed)) continue;
    if (fields.at(-1) !== "text") continue;
    const body = line.slice(line.indexOf(":") + 1).trimStart();
    const values = body.split(",");
    if (values.length < fields.length) {
      diagnostics.push({ code: "UNPARSED_ASS_DIALOGUE", line: trimmed });
      continue;
    }
    const record = {};
    fields.forEach((field, index) => {
      record[field] = index === fields.length - 1 ? values.slice(index).join(",") : values[index];
    });
    const text = String(record.text ?? "").replace(/\{[^}]*\}/g, "").replace(/\\[Nn]/g, "\n");
    captions.push(makeCaption({
      id: captions.length + 1,
      startMs: parseTimestamp(record.start, "ass"),
      endMs: parseTimestamp(record.end, "ass"),
      text,
      source,
    }));
  }
  return { captions, diagnostics, format: "ass", provenance: null };
}

function firstArray(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["segments", "captions", "subtitles", "results", "sentences"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return null;
}

function timeValue(item, names, unitHint) {
  for (const name of names) {
    if (item?.[name] === undefined || item?.[name] === null) continue;
    const value = Number(item[name]);
    if (!Number.isFinite(value)) return null;
    if (name.toLowerCase().includes("ms") || unitHint === "ms") return Math.round(value);
    return secondsToMs(value);
  }
  return null;
}

function normalizeWords(words) {
  if (!Array.isArray(words)) return null;
  return words.map((word, index) => ({
    id: word.id ?? index + 1,
    text: String(word.word ?? word.text ?? word.token ?? "").trim(),
    startMs: timeValue(word, ["startMs", "start_ms", "start", "begin", "begin_time"]),
    endMs: timeValue(word, ["endMs", "end_ms", "end", "finish", "end_time"]),
  }));
}

function parseJson(input, source) {
  let value;
  try {
    value = JSON.parse(input);
  } catch (error) {
    const parseError = new Error(`Invalid JSON: ${error.message}`);
    parseError.code = "INVALID_JSON";
    throw parseError;
  }
  const items = firstArray(value);
  if (!items) {
    const shapeError = new Error("JSON must be an array or contain segments/captions/subtitles/results/sentences.");
    shapeError.code = "UNSUPPORTED_JSON_SHAPE";
    throw shapeError;
  }
  const provenance = String(value.source ?? value.provider ?? value.engine ?? value.model ?? "").trim() || null;
  const captions = items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      const itemError = new Error(`JSON caption item ${index + 1} must be an object.`);
      itemError.code = "INVALID_JSON_ITEM";
      throw itemError;
    }
    const startMs = timeValue(item, ["startMs", "start_ms", "start", "begin", "begin_time", "start_time"]);
    const endMs = timeValue(item, ["endMs", "end_ms", "end", "finish", "end_time", "stop"]);
    const text = item.text ?? item.transcript ?? item.sentence ?? item.content ?? item.value ?? "";
    return makeCaption({
      id: item.id ?? item.segment_id ?? index + 1,
      startMs,
      endMs,
      text,
      lines: String(text ?? "").split(/\r?\n/),
      words: normalizeWords(item.words ?? item.tokens ?? item.wordTimings ?? item.word_timestamps),
      source,
    });
  });
  return { captions, diagnostics: [], format: "json", provenance };
}

export function detectFormat(input, filename = "") {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".srt") return "srt";
  if (extension === ".vtt") return "vtt";
  if (extension === ".ass" || extension === ".ssa") return "ass";
  if (extension === ".json") return "json";
  const trimmed = input.trimStart();
  if (/^WEBVTT(?:[ \t].*)?\r?\n/.test(trimmed)) return "vtt";
  if (/^\[(Script Info|Events)\]/m.test(trimmed)) return "ass";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  return "srt";
}

export function parseCaptions(input, { filename = "stdin", format = "auto" } = {}) {
  const selected = format === "auto" ? detectFormat(input, filename) : format;
  const safeSource = safeSourceName(filename);
  if (selected === "srt") return parseTimedText(input, safeSource, false);
  if (selected === "vtt") return parseTimedText(input, safeSource, true);
  if (selected === "ass") return parseAss(input, safeSource);
  if (selected === "json") return parseJson(input, safeSource);
  throw new Error(`Unsupported format: ${selected}`);
}
