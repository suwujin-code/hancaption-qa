import fs from "node:fs/promises";
import path from "node:path";

const CONFIG_FILENAME = ".hancaptionrc.json";
const CONFIG_KEYS = new Set(["profile", "failOn", "machineGenerated", "thresholds"]);
const PROFILE_NAMES = new Set(["general", "short-video"]);
const FAIL_ON_VALUES = new Set(["error", "warning", "never"]);

const THRESHOLD_RULES = Object.freeze({
  maxCps: { integer: false, minimum: 0, exclusive: true },
  maxLineChars: { integer: true, minimum: 0, exclusive: true },
  maxLines: { integer: true, minimum: 0, exclusive: true },
  minDurationMs: { integer: true, minimum: 0, exclusive: false },
  maxDurationMs: { integer: true, minimum: 0, exclusive: true },
  duplicateGapMs: { integer: true, minimum: 0, exclusive: false },
});

export const THRESHOLD_FLAGS = Object.freeze({
  "--max-cps": "maxCps",
  "--max-line-chars": "maxLineChars",
  "--max-lines": "maxLines",
  "--min-duration-ms": "minDurationMs",
  "--max-duration-ms": "maxDurationMs",
  "--duplicate-gap-ms": "duplicateGapMs",
});

function safeBasename(filename) {
  return String(filename).replaceAll("\\", "/").split("/").at(-1) || CONFIG_FILENAME;
}

function configurationError(source, message) {
  return new Error(`Invalid configuration in "${safeBasename(source)}": ${message}`);
}

export function validateThresholds(value, source = "configuration") {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw configurationError(source, "thresholds must be an object.");
  }
  const result = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const rule = THRESHOLD_RULES[key];
    if (!rule) throw configurationError(source, `unknown threshold "${key}".`);
    if (!Number.isFinite(rawValue) || Math.abs(rawValue) > Number.MAX_SAFE_INTEGER || (rule.integer && !Number.isSafeInteger(rawValue))) {
      throw configurationError(source, `threshold "${key}" must be ${rule.integer ? "a safe integer" : "a finite number within the safe numeric range"}.`);
    }
    const validMinimum = rule.exclusive ? rawValue > rule.minimum : rawValue >= rule.minimum;
    if (!validMinimum) {
      const comparison = rule.exclusive ? "greater than" : "at least";
      throw configurationError(source, `threshold "${key}" must be ${comparison} ${rule.minimum}.`);
    }
    result[key] = rawValue;
  }
  if (
    result.minDurationMs !== undefined &&
    result.maxDurationMs !== undefined &&
    result.minDurationMs > result.maxDurationMs
  ) {
    throw configurationError(source, "minDurationMs cannot exceed maxDurationMs.");
  }
  return result;
}

export function validateConfig(value, source = CONFIG_FILENAME) {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw configurationError(source, "the root value must be an object.");
  }
  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key)) throw configurationError(source, `unknown key "${key}".`);
  }
  const result = {};
  if (value.profile !== undefined) {
    if (!PROFILE_NAMES.has(value.profile)) throw configurationError(source, "profile must be general or short-video.");
    result.profile = value.profile;
  }
  if (value.failOn !== undefined) {
    if (!FAIL_ON_VALUES.has(value.failOn)) throw configurationError(source, "failOn must be error, warning, or never.");
    result.failOn = value.failOn;
  }
  if (value.machineGenerated !== undefined) {
    if (typeof value.machineGenerated !== "boolean") throw configurationError(source, "machineGenerated must be a boolean.");
    result.machineGenerated = value.machineGenerated;
  }
  if (value.thresholds !== undefined) result.thresholds = validateThresholds(value.thresholds, source);
  return result;
}

export async function loadConfig(explicitPath) {
  const filename = explicitPath ?? path.join(process.cwd(), CONFIG_FILENAME);
  let contents;
  try {
    contents = await fs.readFile(filename, "utf8");
  } catch (error) {
    if (!explicitPath && error.code === "ENOENT") return {};
    throw new Error(`Unable to read configuration "${safeBasename(filename)}" (${error.code ?? "read error"}).`);
  }
  let value;
  try {
    value = JSON.parse(contents);
  } catch {
    throw configurationError(filename, "malformed JSON.");
  }
  return validateConfig(value, filename);
}
