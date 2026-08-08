import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("GitHub Action passes caller inputs through environment variables, not shell interpolation", async () => {
  const action = await fs.readFile(new URL("../action.yml", import.meta.url), "utf8");
  const runBlock = action.split(/      run: \|\r?\n/u)[1];
  assert.ok(runBlock, "action must contain a multiline run block");
  assert.doesNotMatch(runBlock, /\$\{\{\s*inputs\./);
  assert.match(action, /HC_PATH: \$\{\{ inputs\.path \}\}/);
  assert.match(runBlock, /args=\("\$HC_PATH"/);
});
