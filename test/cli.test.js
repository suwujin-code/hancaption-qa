import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const clean = fileURLToPath(new URL("fixtures/clean.srt", import.meta.url));
const problematic = fileURLToPath(new URL("fixtures/problematic.srt", import.meta.url));

test("CLI prints a text summary for clean input", async () => {
  const { stdout } = await exec(process.execPath, [cli, clean]);
  assert.match(stdout, /errors=0/);
  assert.match(stdout, /wordAnimationAllowed=false/);
});

test("CLI exits 1 when an error finding is present", async () => {
  await assert.rejects(
    exec(process.execPath, [cli, problematic, "--profile", "short-video"]),
    (error) => error.code === 1 && /NON_POSITIVE_DURATION/.test(error.stdout),
  );
});

test("CLI emits valid JSON", async () => {
  const { stdout } = await exec(process.execPath, [cli, clean, "--format", "json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.schema, "hancaption-qa/report-v1");
});

test("CLI fails closed for an empty file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hancaption-test-"));
  const empty = path.join(directory, "empty.srt");
  await fs.writeFile(empty, "", "utf8");
  try {
    await assert.rejects(exec(process.execPath, [cli, empty]), (error) => error.code === 1 && /NO_CAPTIONS/.test(error.stdout));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("CLI version matches package metadata", async () => {
  const { stdout } = await exec(process.execPath, [cli, "--version"]);
  const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(stdout.trim(), packageJson.version);
});

test("CLI read errors do not disclose the input directory", async () => {
  const privatePath = "/definitely/private/project/secret.srt";
  await assert.rejects(
    exec(process.execPath, [cli, privatePath]),
    (error) => error.code === 2 && /secret\.srt/.test(error.stderr) && !error.stderr.includes("/definitely/private/project"),
  );
});

test("CLI auto-loads project configuration and applies thresholds", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hancaption-config-"));
  await fs.writeFile(path.join(directory, ".hancaptionrc.json"), JSON.stringify({
    profile: "short-video",
    failOn: "never",
    machineGenerated: true,
    thresholds: { maxCps: 1 },
  }), "utf8");
  try {
    const { stdout } = await exec(process.execPath, [cli, clean, "--format", "json"], { cwd: directory });
    const report = JSON.parse(stdout);
    assert.equal(report.profile, "short-video");
    assert.equal(report.config.maxCps, 1);
    assert.equal(report.summary.textReviewRequired, true);
    assert.ok(report.summary.warning > 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("explicit config replaces auto-config and CLI flags win", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hancaption-config-"));
  await fs.writeFile(path.join(directory, ".hancaptionrc.json"), JSON.stringify({ profile: "short-video", failOn: "warning" }), "utf8");
  await fs.writeFile(path.join(directory, "explicit.json"), JSON.stringify({ profile: "general", machineGenerated: true, thresholds: { maxCps: 1 } }), "utf8");
  try {
    const { stdout } = await exec(process.execPath, [
      cli,
      clean,
      "--config", "explicit.json",
      "--profile", "short-video",
      "--no-machine-generated",
      "--max-cps", "99",
      "--format", "json",
    ], { cwd: directory });
    const report = JSON.parse(stdout);
    assert.equal(report.profile, "short-video");
    assert.equal(report.config.maxCps, 99);
    assert.equal(report.summary.textReviewRequired, false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("CLI rejects malformed and unknown configuration without disclosing directories", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hancaption-private-"));
  const malformed = path.join(directory, "malformed.json");
  const unknown = path.join(directory, "unknown.json");
  await fs.writeFile(malformed, "{", "utf8");
  await fs.writeFile(unknown, JSON.stringify({ output: "report.html" }), "utf8");
  try {
    await assert.rejects(
      exec(process.execPath, [cli, clean, "--config", malformed]),
      (error) => error.code === 2 && /malformed\.json/.test(error.stderr) && /malformed JSON/.test(error.stderr) && !error.stderr.includes(directory),
    );
    await assert.rejects(
      exec(process.execPath, [cli, clean, "--config", unknown]),
      (error) => error.code === 2 && /unknown key/.test(error.stderr) && !error.stderr.includes(directory),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("CLI rejects invalid thresholds and a missing explicit config", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hancaption-config-"));
  const invalid = path.join(directory, "invalid.json");
  await fs.writeFile(invalid, JSON.stringify({ thresholds: { minDurationMs: 900, maxDurationMs: 100 } }), "utf8");
  try {
    await assert.rejects(
      exec(process.execPath, [cli, clean, "--config", invalid]),
      (error) => error.code === 2 && /minDurationMs cannot exceed maxDurationMs/.test(error.stderr),
    );
    await assert.rejects(
      exec(process.execPath, [cli, clean, "--config", path.join(directory, "missing.json")]),
      (error) => error.code === 2 && /missing\.json/.test(error.stderr) && !error.stderr.includes(directory),
    );
    await assert.rejects(
      exec(process.execPath, [cli, clean, "--max-lines", "1.5"]),
      (error) => error.code === 2 && /maxLines/.test(error.stderr),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("CLI revalidates merged thresholds after precedence resolution", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hancaption-config-"));
  const config = path.join(directory, "config.json");
  await fs.writeFile(config, JSON.stringify({ thresholds: { minDurationMs: 900 } }), "utf8");
  try {
    await assert.rejects(
      exec(process.execPath, [cli, clean, "--config", config, "--max-duration-ms", "100"]),
      (error) => error.code === 2 && /minDurationMs cannot exceed maxDurationMs/.test(error.stderr),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("CLI accepts only safe, plain decimal threshold arguments", async () => {
  for (const [option, value] of [
    ["--min-duration-ms", ""],
    ["--duplicate-gap-ms", " "],
    ["--max-cps", "0x10"],
    ["--max-cps", "9007199254740992"],
    ["--max-lines", "9007199254740992"],
  ]) {
    await assert.rejects(
      exec(process.execPath, [cli, clean, option, value]),
      (error) => error.code === 2,
    );
  }
  const { stdout } = await exec(process.execPath, [cli, clean, "--max-cps", "1.5", "--format", "json"]);
  assert.equal(JSON.parse(stdout).config.maxCps, 1.5);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hancaption-config-"));
  const config = path.join(directory, "unsafe.json");
  await fs.writeFile(config, JSON.stringify({ thresholds: { maxCps: 9007199254740992 } }), "utf8");
  try {
    await assert.rejects(
      exec(process.execPath, [cli, clean, "--config", config]),
      (error) => error.code === 2 && /maxCps/.test(error.stderr),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("configuration read errors redact Windows-style directories", async () => {
  const windowsPath = "C:\\private\\captions\\config.json";
  await assert.rejects(
    exec(process.execPath, [cli, clean, "--config", windowsPath]),
    (error) => error.code === 2 && /config\.json/.test(error.stderr) && !error.stderr.includes("private") && !error.stderr.includes("captions"),
  );
});
