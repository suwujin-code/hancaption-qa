import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hancaption-pack-"));

try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--json"], { cwd: projectRoot, encoding: "utf8" }));
  const tarball = path.join(projectRoot, packed[0].filename);
  execFileSync("npm", ["init", "--yes"], { cwd: tempDirectory, stdio: "ignore" });
  execFileSync("npm", ["install", tarball], { cwd: tempDirectory, stdio: "ignore" });
  const cli = path.join(tempDirectory, "node_modules", ".bin", "hancaption");
  const fixture = path.join(projectRoot, "test", "fixtures", "clean.srt");
  const output = execFileSync(cli, [fixture, "--format", "json"], { cwd: tempDirectory, encoding: "utf8" });
  const report = JSON.parse(output);
  if (report.schema !== "hancaption-qa/report-v1" || report.summary.error !== 0) {
    throw new Error("Installed package returned an invalid report.");
  }
  process.stdout.write(`Installed-package smoke test passed for ${packed[0].filename}.\n`);
  fs.rmSync(tarball, { force: true });
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
