#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { auditCaptions, formatHtml, formatSarif, formatText, parseCaptions, shouldFail, VERSION } from "./index.js";

const HELP = `HanCaption QA — offline-first QA for Chinese and AI-generated subtitles

Usage:
  hancaption <file> [options]
  cat captions.srt | hancaption - [options]

Options:
  --input-format <auto|srt|vtt|ass|json>  Force the input parser (default: auto)
  --format <text|json|html|sarif>          Report format (default: text)
  --output <path>                          Write the report to a file
  --profile <general|short-video>          Editorial threshold profile
  --machine-generated                      Require human text review
  --fail-on <error|warning|never>           Exit policy (default: error)
  --help                                    Show this help
  --version                                 Show the package version

Thresholds are editorial defaults, not universal broadcast standards.`;

function parseArgs(argv) {
  const result = { format: "text", inputFormat: "auto", profile: "general", failOn: "error", machineGenerated: false, file: null, output: null };
  const values = [...argv];
  while (values.length) {
    const token = values.shift();
    if (token === "--help" || token === "-h") result.help = true;
    else if (token === "--version" || token === "-v") result.version = true;
    else if (token === "--machine-generated") result.machineGenerated = true;
    else if (token === "--format") result.format = values.shift();
    else if (token === "--input-format") result.inputFormat = values.shift();
    else if (token === "--profile") result.profile = values.shift();
    else if (token === "--fail-on") result.failOn = values.shift();
    else if (token === "--output" || token === "-o") result.output = values.shift();
    else if (token?.startsWith("-" ) && token !== "-") throw new Error(`Unknown option: ${token}`);
    else if (!result.file) result.file = token;
    else throw new Error(`Unexpected argument: ${token}`);
  }
  return result;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (!args.file) throw new Error("Missing input file. Use --help for usage.");
  if (!["text", "json", "html", "sarif"].includes(args.format)) throw new Error(`Unsupported report format: ${args.format}`);
  if (!["error", "warning", "never"].includes(args.failOn)) throw new Error(`Unsupported fail-on value: ${args.failOn}`);
  let input;
  if (args.file === "-") input = await readStdin();
  else {
    try {
      input = await fs.readFile(args.file, "utf8");
    } catch (error) {
      const basename = args.file.replaceAll("\\", "/").split("/").at(-1) || "input";
      throw new Error(`Unable to read input file "${basename}" (${error.code ?? "read error"}).`);
    }
  }
  const parsed = parseCaptions(input, { filename: args.file === "-" ? "stdin" : args.file, format: args.inputFormat });
  const report = auditCaptions(parsed, { profile: args.profile, machineGenerated: args.machineGenerated });
  const output = args.format === "json"
    ? JSON.stringify(report, null, 2)
    : args.format === "html"
      ? formatHtml(report)
      : args.format === "sarif"
        ? formatSarif(report)
        : formatText(report);
  if (args.output) await fs.writeFile(args.output, `${output}\n`, "utf8");
  else process.stdout.write(`${output}\n`);
  if (shouldFail(report, args.failOn)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`hancaption: ${error.message}\n`);
  process.exitCode = 2;
});
