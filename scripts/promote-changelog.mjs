#!/usr/bin/env node
// Promote the [Unreleased] section in CHANGELOG.md to a versioned section
// dated today (UTC). Idempotent: a second run on a CHANGELOG that has no
// [Unreleased] content (or only the heading) is a no-op.
//
// Usage: node scripts/promote-changelog.mjs <version>
// Called by .github/workflows/release-verify.yml after a successful smoke
// test, after `npm version <bump>` has updated package.json.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("usage: promote-changelog.mjs <version>");
  process.exit(2);
}

const path = resolve("CHANGELOG.md");
const original = readFileSync(path, "utf8");

const unreleasedRe = /## \[Unreleased\]\n([\s\S]*?)(?=\n## \[|\n*$)/;
const match = unreleasedRe.exec(original);
if (!match) {
  console.error("CHANGELOG.md has no [Unreleased] section — nothing to promote");
  process.exit(0);
}

const body = match[1].trim();
if (body.length === 0) {
  console.error("[Unreleased] is empty — nothing to promote");
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const replacement =
  `## [Unreleased]\n\n## [${version}] — ${today}\n${match[1]}`;

const updated = original.replace(unreleasedRe, replacement);
writeFileSync(path, updated);
console.error(`promoted [Unreleased] → [${version}] — ${today}`);
