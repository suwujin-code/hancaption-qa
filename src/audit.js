const VISIBLE = /[\p{L}\p{N}\p{Script=Han}]/gu;
const CANTONESE_HINTS = /[嘅咗喺唔冇啲佢哋嚟喎噉咁]/u;

export const PROFILES = Object.freeze({
  general: {
    maxCps: 17,
    maxLineChars: 42,
    maxLines: 2,
    minDurationMs: 400,
    maxDurationMs: 8_000,
    duplicateGapMs: 1_500,
  },
  "short-video": {
    maxCps: 15,
    maxLineChars: 18,
    maxLines: 2,
    minDurationMs: 500,
    maxDurationMs: 6_000,
    duplicateGapMs: 1_000,
  },
});

function severityRank(severity) {
  return { error: 0, warning: 1, info: 2 }[severity] ?? 9;
}

function normalizeText(text) {
  return String(text ?? "").normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
}

function visibleLength(text) {
  return [...String(text ?? "").matchAll(VISIBLE)].length;
}

function finding(code, severity, caption, message, detail = {}) {
  return {
    code,
    severity,
    captionId: caption?.id ?? null,
    startMs: caption?.startMs ?? null,
    endMs: caption?.endMs ?? null,
    message,
    ...detail,
  };
}

function auditWordTimings(caption) {
  if (!Array.isArray(caption.words) || caption.words.length === 0) {
    return { safe: false, reason: "missing-word-timings", findings: [] };
  }
  const findings = [];
  let cursor = caption.startMs;
  for (const word of caption.words) {
    if (!word.text) {
      findings.push(finding("EMPTY_WORD", "error", caption, "Word timing has empty text.", { wordId: word.id }));
    }
    if (!Number.isFinite(word.startMs) || !Number.isFinite(word.endMs) || word.endMs <= word.startMs) {
      findings.push(finding("INVALID_WORD_TIME", "error", caption, "Word timing must have a positive duration.", { wordId: word.id }));
      continue;
    }
    if (Number.isFinite(cursor) && word.startMs < cursor) {
      findings.push(finding("OVERLAPPING_WORDS", "error", caption, "Word timings overlap or are out of order.", { wordId: word.id }));
    }
    if (Number.isFinite(caption.startMs) && word.startMs < caption.startMs - 20) {
      findings.push(finding("WORD_OUTSIDE_CAPTION", "error", caption, "A word begins before its caption.", { wordId: word.id }));
    }
    if (Number.isFinite(caption.endMs) && word.endMs > caption.endMs + 20) {
      findings.push(finding("WORD_OUTSIDE_CAPTION", "error", caption, "A word ends after its caption.", { wordId: word.id }));
    }
    cursor = word.endMs;
  }
  const captionText = normalizeText(caption.text);
  const wordText = normalizeText(caption.words.map((word) => word.text).join(""));
  if (captionText && wordText && captionText !== wordText) {
    findings.push(finding("WORD_TEXT_MISMATCH", "error", caption, "Word timing text does not match the caption text."));
  }
  return {
    safe: Boolean(caption.text.trim()) && findings.every((item) => item.severity !== "error"),
    reason: findings.some((item) => item.severity === "error") ? "invalid-word-timings" : null,
    findings,
  };
}

export function auditCaptions(parsed, options = {}) {
  const profileName = options.profile ?? "general";
  const baseProfile = PROFILES[profileName];
  if (!baseProfile) throw new Error(`Unknown profile: ${profileName}`);
  const config = { ...baseProfile, ...(options.thresholds ?? {}) };
  const captions = [...parsed.captions].sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity));
  const findings = parsed.diagnostics.map((item) => ({
    code: item.code,
    severity: "error",
    captionId: null,
    startMs: null,
    endMs: null,
    message: item.message ?? "A block could not be parsed and was skipped.",
    parser: item,
  }));
  const animationChecks = [];
  if (captions.length === 0) {
    findings.push({
      code: "NO_CAPTIONS",
      severity: "error",
      captionId: null,
      startMs: null,
      endMs: null,
      message: "No caption cues were parsed.",
    });
  }

  for (const [index, caption] of captions.entries()) {
    const durationMs = Number.isFinite(caption.startMs) && Number.isFinite(caption.endMs)
      ? caption.endMs - caption.startMs
      : null;
    if (!Number.isFinite(caption.startMs) || !Number.isFinite(caption.endMs)) {
      findings.push(finding("INVALID_TIMESTAMP", "error", caption, "Caption start and end timestamps must be valid."));
    } else if (caption.startMs < 0 || caption.endMs < 0) {
      findings.push(finding("NEGATIVE_TIMESTAMP", "error", caption, "Caption timestamps cannot be negative."));
    } else if (durationMs <= 0) {
      findings.push(finding("NON_POSITIVE_DURATION", "error", caption, "Caption duration must be greater than zero.", { durationMs }));
    } else {
      if (durationMs < config.minDurationMs) {
        findings.push(finding("TOO_BRIEF", "warning", caption, `Caption is shorter than ${config.minDurationMs} ms.`, { durationMs }));
      }
      if (durationMs > config.maxDurationMs) {
        findings.push(finding("TOO_LONG", "warning", caption, `Caption is longer than ${config.maxDurationMs} ms.`, { durationMs }));
      }
    }

    if (!caption.text.trim()) {
      findings.push(finding("EMPTY_CAPTION", "error", caption, "Caption text is empty."));
    }
    const lines = caption.lines?.length ? caption.lines : caption.text.split(/\r?\n/);
    if (lines.length > config.maxLines) {
      findings.push(finding("TOO_MANY_LINES", "warning", caption, `Caption has ${lines.length} lines; profile limit is ${config.maxLines}.`, { lines: lines.length }));
    }
    for (const [lineIndex, line] of lines.entries()) {
      const count = [...line].length;
      if (count > config.maxLineChars) {
        findings.push(finding("LINE_TOO_LONG", "warning", caption, `Line ${lineIndex + 1} has ${count} characters; profile limit is ${config.maxLineChars}.`, { line: lineIndex + 1, characters: count }));
      }
    }
    if (durationMs > 0) {
      const cps = visibleLength(caption.text) / (durationMs / 1_000);
      if (cps > config.maxCps) {
        findings.push(finding("READING_SPEED", "warning", caption, `Reading speed is ${cps.toFixed(1)} characters/second; profile limit is ${config.maxCps}.`, { cps: Number(cps.toFixed(2)) }));
      }
    }
    if (/\uFFFD/u.test(caption.text)) {
      findings.push(finding("REPLACEMENT_CHARACTER", "error", caption, "Caption contains the Unicode replacement character; check encoding or transcription output."));
    }
    if (/\p{Script=Han}\s+[，。！？；：、]/u.test(caption.text)) {
      findings.push(finding("SPACE_BEFORE_CJK_PUNCTUATION", "warning", caption, "Unexpected space before Chinese punctuation."));
    }
    if (CANTONESE_HINTS.test(caption.text)) {
      findings.push(finding("POSSIBLE_CANTONESE_MARKERS", "info", caption, "Possible Cantonese markers detected by a limited heuristic; preserve source text for human review before rewriting."));
    }

    const previous = captions[index - 1];
    if (previous && Number.isFinite(previous.endMs) && Number.isFinite(caption.startMs)) {
      if (caption.startMs < previous.endMs) {
        findings.push(finding("CAPTION_OVERLAP", "error", caption, `Caption overlaps ${previous.id}.`, { previousCaptionId: previous.id, overlapMs: previous.endMs - caption.startMs }));
      }
      const gapMs = caption.startMs - previous.endMs;
      if (
        gapMs <= config.duplicateGapMs &&
        normalizeText(previous.text) &&
        normalizeText(previous.text) === normalizeText(caption.text)
      ) {
        findings.push(finding("ADJACENT_DUPLICATE", "warning", caption, `Caption duplicates ${previous.id}.`, { previousCaptionId: previous.id, gapMs }));
      }
    }

    const wordCheck = auditWordTimings(caption);
    animationChecks.push({ captionId: caption.id, safe: wordCheck.safe, reason: wordCheck.reason });
    findings.push(...wordCheck.findings);
  }

  const textReviewRequired = Boolean(
    options.machineGenerated ||
    parsed.provenance ||
    findings.some((item) => ["REPLACEMENT_CHARACTER", "POSSIBLE_CANTONESE_MARKERS", "WORD_TEXT_MISMATCH"].includes(item.code)),
  );
  if (textReviewRequired) {
    findings.push({
      code: "TEXT_REVIEW_REQUIRED",
      severity: "info",
      captionId: null,
      startMs: null,
      endMs: null,
      message: "Machine-generated or language-sensitive text should remain source-matched until a human approves a replacement.",
    });
  }

  findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || (a.startMs ?? Infinity) - (b.startMs ?? Infinity));
  const counts = { error: 0, warning: 0, info: 0 };
  for (const item of findings) counts[item.severity] += 1;
  const structuralErrors = findings.some((item) => item.severity === "error" && item.code !== "TEXT_REVIEW_REQUIRED");
  const wordAnimationAllowed = captions.length > 0 && !structuralErrors && animationChecks.every((item) => item.safe);
  return {
    schema: "hancaption-qa/report-v1",
    source: captions[0]?.source ?? null,
    format: parsed.format,
    profile: profileName,
    config,
    summary: {
      captions: captions.length,
      findings: findings.length,
      ...counts,
      textReviewRequired,
      wordAnimationAllowed,
    },
    animationChecks,
    findings,
  };
}

export function shouldFail(report, failOn = "error") {
  if (failOn === "never") return false;
  if (failOn === "warning") return report.summary.error > 0 || report.summary.warning > 0;
  return report.summary.error > 0;
}
