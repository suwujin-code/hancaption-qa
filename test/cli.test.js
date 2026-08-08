import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const exec = promisify(execFile);
const cli = new URL("../src/cli.js", import.meta.url);
const clean = new URL("fixtures/clean.srt", import.meta.url);
const problematic = new URL("fixtures/problematic.srt", import.meta.url);

test("CLI prints a text summary for clean input", async () => {
  const { stdout } = await exec(process.execPath, [cli.pathname, clean.pathname]);
  assert.match(stdout, /errors=0/);
  assert.match(stdout, /wordAnimationAllowed=false/);
});

test("CLI exits 1 when an error finding is present", async () => {
  await assert.rejects(
    exec(process.execPath, [cli.pathname, problematic.pathname, "--profile", "short-video"]),
    (error) => error.code === 1 && /NON_POSITIVE_DURATION/.test(error.stdout),
  );
});

test("CLI emits valid JSON", async () => {
  const { stdout } = await exec(process.execPath, [cli.pathname, clean.pathname, "--format", "json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.schema, "hancaption-qa/report-v1");
});

test("CLI fails closed for an empty file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hancaption-test-"));
  const empty = path.join(directory, "empty.srt");
  await fs.writeFile(empty, "", "utf8");
  try {
    await assert.rejects(exec(process.execPath, [cli.pathname, empty]), (error) => error.code === 1 && /NO_CAPTIONS/.test(error.stdout));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("CLI version matches package metadata", async () => {
  const { stdout } = await exec(process.execPath, [cli.pathname, "--version"]);
  const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(stdout.trim(), packageJson.version);
});

test("CLI read errors do not disclose the input directory", async () => {
  const privatePath = "/definitely/private/project/secret.srt";
  await assert.rejects(
    exec(process.execPath, [cli.pathname, privatePath]),
    (error) => error.code === 2 && /secret\.srt/.test(error.stderr) && !error.stderr.includes("/definitely/private/project"),
  );
});
