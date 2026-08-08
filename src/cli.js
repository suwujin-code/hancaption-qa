#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { auditCaptions, formatHtml, formatSarif, formatText, parseCaptions, shouldFail, VERSION } from "./index.js";
import { loadConfig, THRESHOLD_FLAGS, validateThresholds } from "./config.js";

const HELP = `HanCaption QA — offline-first QA for Chinese and AI-generated subtitles

Usage:
  hancaption <file> [options]
  cat captions.srt | hancaption - [options]

Options:
  --input-format <auto|srt|vtt|ass|json>  Force the input parser (default: auto)
  --format <text|json|html|sarif>          Report format (default: text)
  --output <path>                          Write the report to a file
  --config <path>                          Read an explicit JSON configuration
  --profile <general|short-video>          Editorial threshold profile
  --machine-generated                      Require human text review
  --no-machine-generated                   Clear that review marker
  --max-cps <number>                       Override maximum characters/second
  --max-line-chars <integer>               Override maximum characters/line
  --max-lines <integer>                    Override maximum lines/caption
  --min-duration-ms <integer>              Override minimum cue duration
  --max-duration-ms <integer>              Override maximum cue duration
  --duplicate-gap-ms <integer>             Override duplicate gap window
  --fail-on <error|warning|never>           Exit policy (default: error)
  --help                                    Show this help
  --version                                 Show the package version

Thresholds are editorial defaults, not universal broadcast standards.`;

function parseArgs(argv) {
  const result = { file: null, output: null, config: null, thresholds: {} };
  const values = [...argv];
  const takeValue = (option) => {
    const value = values.shift();
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${option}.`);
    return value;
  };
  const takeDecimal = (option) => {
    const value = takeValue(option);
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
      throw new Error(`Invalid decimal value for ${option}.`);
    }
    return Number(value);
  };
  while (values.length) {
    const token = values.shift();
    if (token === "--help" || token === "-h") result.help = true;
    else if (token === "--version" || token === "-v") result.version = true;
    else if (token === "--machine-generated") result.machineGenerated = true;
    else if (token === "--no-machine-generated") result.machineGenerated = false;
    else if (token === "--format") result.format = takeValue(token);
    else if (token === "--input-format") result.inputFormat = takeValue(token);
    else if (token === "--profile") result.profile = takeValue(token);
    else if (token === "--fail-on") result.failOn = takeValue(token);
    else if (token === "--config") result.config = takeValue(token);
    else if (token === "--output" || token === "-o") result.output = takeValue(token);
    else if (THRESHOLD_FLAGS[token]) {
      result.thresholds[THRESHOLD_FLAGS[token]] = takeDecimal(token);
    }
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
  const config = await loadConfig(args.config);
  const format = args.format ?? "text";
  const inputFormat = args.inputFormat ?? "auto";
  const profile = args.profile ?? config.profile ?? "general";
  const failOn = args.failOn ?? config.failOn ?? "error";
  const machineGenerated = args.machineGenerated ?? config.machineGenerated ?? false;
  const cliThresholds = validateThresholds(args.thresholds, "command line");
  const thresholds = validateThresholds({ ...(config.thresholds ?? {}), ...cliThresholds }, "resolved configuration");
  if (!["text", "json", "html", "sarif"].includes(format)) throw new Error(`Unsupported report format: ${format}`);
  if (!["auto", "srt", "vtt", "ass", "json"].includes(inputFormat)) throw new Error(`Unsupported input format: ${inputFormat}`);
  if (!["general", "short-video"].includes(profile)) throw new Error(`Unsupported profile: ${profile}`);
  if (!["error", "warning", "never"].includes(failOn)) throw new Error(`Unsupported fail-on value: ${failOn}`);
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
  const parsed = parseCaptions(input, { filename: args.file === "-" ? "stdin" : args.file, format: inputFormat });
  const report = auditCaptions(parsed, { profile, machineGenerated, thresholds });
  const output = format === "json"
    ? JSON.stringify(report, null, 2)
    : format === "html"
      ? formatHtml(report)
      : format === "sarif"
        ? formatSarif(report)
        : formatText(report);
  if (args.output) await fs.writeFile(args.output, `${output}\n`, "utf8");
  else process.stdout.write(`${output}\n`);
  if (shouldFail(report, failOn)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`hancaption: ${error.message}\n`);
  process.exitCode = 2;
});
