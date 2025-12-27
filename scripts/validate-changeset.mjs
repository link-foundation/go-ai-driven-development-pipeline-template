#!/usr/bin/env bun

/**
 * Validates that a PR includes a changelog fragment.
 * Only checks for fragments added by the current PR, not pre-existing ones.
 *
 * Usage:
 *   bun scripts/validate-changeset.mjs
 *
 * Environment:
 *   GITHUB_BASE_REF - The base branch (e.g., main) for comparison
 */

import { execSync } from "child_process";
import { readdirSync, existsSync } from "fs";
import { join } from "path";

const CHANGELOG_DIR = join(process.cwd(), "changelog.d");

function runCapture(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function getAddedFragments() {
  const baseBranch = process.env.GITHUB_BASE_REF || "main";

  // Get files added in this PR compared to base branch
  const addedFiles = runCapture(
    `git diff --name-only --diff-filter=A origin/${baseBranch}...HEAD`
  );

  if (!addedFiles) {
    // Fallback: check if there are any fragments at all
    if (!existsSync(CHANGELOG_DIR)) {
      return [];
    }

    const files = readdirSync(CHANGELOG_DIR);
    return files.filter((f) => f.endsWith(".md") && f !== "README.md");
  }

  // Filter to only changelog.d/*.md files
  return addedFiles
    .split("\n")
    .filter((f) => f.startsWith("changelog.d/") && f.endsWith(".md"))
    .filter((f) => !f.endsWith("README.md"));
}

function hasSourceChanges() {
  const baseBranch = process.env.GITHUB_BASE_REF || "main";

  // Get all changed files
  const changedFiles = runCapture(
    `git diff --name-only origin/${baseBranch}...HEAD`
  );

  if (!changedFiles) {
    return false;
  }

  // Check if any source files were changed (not just config/docs)
  const sourcePatterns = [
    /^pkg\//,
    /^cmd\//,
    /^internal\//,
    /\.go$/,
  ];

  const excludePatterns = [
    /_test\.go$/,
    /^examples\//,
    /^scripts\//,
    /^\.github\//,
    /^changelog\.d\//,
    /\.md$/,
    /\.ya?ml$/,
    /\.json$/,
    /\.toml$/,
  ];

  return changedFiles.split("\n").some((file) => {
    const isSource = sourcePatterns.some((p) => p.test(file));
    const isExcluded = excludePatterns.some((p) => p.test(file));
    return isSource && !isExcluded;
  });
}

function main() {
  console.log("Validating changelog fragment...\n");

  try {
    const addedFragments = getAddedFragments();
    const sourceChanged = hasSourceChanges();

    if (addedFragments.length > 0) {
      console.log("Found changelog fragment(s):");
      for (const fragment of addedFragments) {
        console.log(`  - ${fragment}`);
      }
      console.log("\nValidation passed!");
      return;
    }

    if (!sourceChanged) {
      console.log("No source code changes detected.");
      console.log("Changelog fragment not required for non-source changes.");
      console.log("\nValidation passed!");
      return;
    }

    // Source changed but no fragment added
    console.error("ERROR: Source code was changed but no changelog fragment was added.");
    console.error("\nPlease create a changelog fragment in changelog.d/");
    console.error("Filename format: YYYYMMDD_HHMMSS_description.md");
    console.error("\nExample content:");
    console.error("### Added");
    console.error("- New feature description");
    console.error("\nSee changelog.d/README.md for more details.");
    process.exit(1);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
