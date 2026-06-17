#!/usr/bin/env node
// Workshop runtime-scaffolding check. Enforces the standard that every lwc
// workshop ships server-side progress wired correctly, so a learner never
// hits the "these lwc tools are for Cowork mode" bleed or a stale walker path.
// No network. Run from a member repo root: `node scripts/validate-scaffolding.mjs`.
//
// Checks (see docs/WORKSHOP_STANDARD.md → "Runtime scaffolding"):
//   1. .mcp.json exists at the repo root and declares an `lwc-*` progress server
//      invoked as { "command": "lwc" } (the stdio MCP proxy).
//   2. .claude/settings.json pre-approves every `lwc-*` server via
//      enabledMcpjsonServers (so learners never see the MCP trust prompt).
//   3. If a session-start hook exists, it does not reference the stale walker
//      path `.workshop/<workshop>/.claude/skills/` (walkers live at
//      `.claude/skills/<lesson-walker>.md`).
//
// Chain-suite repos (CCA): .mcp.json at the working-tree tip is the final
// lesson state after a re-cut, which carries the progress server, so the same
// check holds. The per-tag seeding is handled by the chain-edit overlay.
import { readFileSync, existsSync } from "node:fs";

export function checkScaffolding(read) {
  const problems = [];

  const mcpRaw = read(".mcp.json");
  if (mcpRaw == null) {
    problems.push(".mcp.json missing at repo root — no progress MCP server ships (Cowork-bleed risk)");
    return problems; // nothing else to check without it
  }
  let mcp;
  try {
    mcp = JSON.parse(mcpRaw);
  } catch (e) {
    problems.push(`.mcp.json is not valid JSON: ${e.message}`);
    return problems;
  }
  const servers = (mcp && mcp.mcpServers) || {};
  const lwcServers = Object.keys(servers).filter((n) => n.startsWith("lwc-"));
  if (lwcServers.length === 0) {
    problems.push('.mcp.json has no `lwc-*` progress server — add { "lwc-<id>": { "command": "lwc" } }');
  }
  for (const name of lwcServers) {
    const cmd = servers[name] && servers[name].command;
    if (cmd !== "lwc") {
      problems.push(`progress server "${name}" must be { "command": "lwc" } (the stdio MCP proxy), got command=${JSON.stringify(cmd)}`);
    }
  }

  const settingsRaw = read(".claude/settings.json");
  let enabled = [];
  if (settingsRaw == null) {
    problems.push(".claude/settings.json missing — cannot pre-approve the progress server");
  } else {
    try {
      enabled = JSON.parse(settingsRaw).enabledMcpjsonServers || [];
    } catch (e) {
      problems.push(`.claude/settings.json is not valid JSON: ${e.message}`);
    }
  }
  for (const name of lwcServers) {
    if (!enabled.includes(name)) {
      problems.push(`"${name}" not pre-approved — add it to enabledMcpjsonServers in .claude/settings.json (learners get an MCP trust prompt otherwise)`);
    }
  }

  const hook = read(".claude/hooks/session-start.sh");
  if (hook != null && /\.workshop\/<workshop>\/\.claude\/skills/.test(hook)) {
    problems.push("session-start.sh references the stale walker path `.workshop/<workshop>/.claude/skills/` — walkers live at `.claude/skills/<lesson-walker>.md`");
  }

  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
  const problems = checkScaffolding(read);
  if (problems.length) {
    console.error(`validate-scaffolding: ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✘ ${p}`);
    console.error("\nSee docs/WORKSHOP_STANDARD.md → Runtime scaffolding.");
    process.exit(1);
  }
  console.log("validate-scaffolding: OK — progress server present, pre-approved, hook path clean.");
}
