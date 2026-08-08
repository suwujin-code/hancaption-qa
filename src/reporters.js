import { formatTimestamp } from "./time.js";
import { VERSION } from "./meta.js";

const ICONS = { error: "✖", warning: "⚠", info: "•" };

export function formatText(report, { color = false } = {}) {
  void color;
  const header = [
    `HanCaption QA · ${report.source ?? "input"}`,
    `format=${report.format} profile=${report.profile} captions=${report.summary.captions}`,
    `errors=${report.summary.error} warnings=${report.summary.warning} info=${report.summary.info}`,
    `textReviewRequired=${report.summary.textReviewRequired} wordAnimationAllowed=${report.summary.wordAnimationAllowed}`,
  ];
  const rows = report.findings.map((item) => {
    const location = item.captionId === null
      ? "global"
      : `${formatTimestamp(item.startMs)} caption=${item.captionId}`;
    return `${ICONS[item.severity]} ${item.severity.toUpperCase()} ${item.code} [${location}] ${item.message}`;
  });
  return [...header, "", ...(rows.length ? rows : ["✓ No findings."])].join("\n");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

export function formatHtml(report) {
  const cards = report.findings.map((item) => `
    <article class="finding ${item.severity}">
      <div><span>${escapeHtml(item.severity)}</span><strong>${escapeHtml(item.code)}</strong></div>
      <p>${escapeHtml(item.message)}</p>
      <small>${item.captionId === null ? "global" : `${formatTimestamp(item.startMs)} · caption ${escapeHtml(item.captionId)}`}</small>
    </article>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HanCaption QA Report</title><style>
:root{color-scheme:dark;background:#0a0c10;color:#f5f7fb;font-family:Inter,ui-sans-serif,system-ui,sans-serif}body{max-width:980px;margin:0 auto;padding:48px 24px}h1{font-size:clamp(32px,6vw,68px);margin:0}.lead{color:#aeb7c6;font-size:18px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:32px 0}.metric,.finding{background:#121722;border:1px solid #263044;border-radius:14px;padding:18px}.metric b{display:block;font-size:30px}.metric span,small{color:#92a0b5}.finding{margin:10px 0}.finding>div{display:flex;gap:12px;align-items:center}.finding span{text-transform:uppercase;font-size:11px;letter-spacing:.08em}.finding.error{border-left:5px solid #ff5c71}.finding.warning{border-left:5px solid #ffc857}.finding.info{border-left:5px solid #5aa9ff}@media(max-width:700px){.metrics{grid-template-columns:repeat(2,1fr)}}
</style></head><body><h1>HanCaption QA</h1><p class="lead">${escapeHtml(report.source ?? "input")} · ${escapeHtml(report.profile)} profile</p>
<section class="metrics"><div class="metric"><b>${report.summary.captions}</b><span>captions</span></div><div class="metric"><b>${report.summary.error}</b><span>errors</span></div><div class="metric"><b>${report.summary.warning}</b><span>warnings</span></div><div class="metric"><b>${report.summary.wordAnimationAllowed ? "yes" : "no"}</b><span>word animation</span></div></section>
<main>${cards || '<article class="finding info"><p>No findings.</p></article>'}</main></body></html>`;
}

export function formatSarif(report) {
  const rules = new Map();
  for (const item of report.findings) {
    if (!rules.has(item.code)) {
      rules.set(item.code, { id: item.code, shortDescription: { text: item.message } });
    }
  }
  return JSON.stringify({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "HanCaption QA", version: VERSION, rules: [...rules.values()] } },
      results: report.findings.map((item) => ({
        ruleId: item.code,
        level: item.severity === "error" ? "error" : item.severity === "warning" ? "warning" : "note",
        message: { text: item.message },
        locations: item.source || report.source ? [{ physicalLocation: {
          artifactLocation: { uri: item.source ?? report.source },
          region: item.captionId === null ? undefined : { startLine: Number(item.captionId) || 1 },
        } }] : undefined,
      })),
    }],
  }, null, 2);
}
