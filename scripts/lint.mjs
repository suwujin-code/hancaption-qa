import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const files = [
  ...fs.readdirSync(path.join(projectRoot, "src"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(projectRoot, "src", name)),
  ...fs.readdirSync(path.join(projectRoot, "test"))
    .filter((name) => name.endsWith(".test.js"))
    .map((name) => path.join(projectRoot, "test", name)),
].sort();

for (const filename of files) execFileSync(process.execPath, ["--check", filename], { stdio: "inherit" });

process.stdout.write(`Syntax check passed for ${files.length} files.\n`);
