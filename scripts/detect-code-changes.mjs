#!/usr/bin/env bun

/**
 * Detect code changes for CI/CD pipeline
 *
 * This script detects what types of files have changed between two commits
 * and outputs the results for use in GitHub Actions workflow conditions.
 *
 * Key behavior:
 * - For PRs: compares the PR head against its merge base
 * - For pushes: compares HEAD against the pre-push commit
 * - For local runs: compares HEAD against its first parent
 * - Excludes certain folders and file types from "code changes" detection
 *
 * Excluded from code changes (don't require changesets):
 * - Markdown files (*.md) in any folder
 * - .changeset/ folder (changeset metadata)
 * - docs/ folder (documentation)
 * - experiments/ folder (experimental scripts)
 * - examples/ folder (example scripts)
 *
 * Usage:
 *   bun scripts/detect-code-changes.mjs
 *
 * Environment variables (set by GitHub Actions):
 *   - GITHUB_EVENT_NAME: 'pull_request' or 'push'
 *   - GITHUB_BASE_SHA: Base commit SHA for PR
 *   - GITHUB_HEAD_SHA: Head commit SHA for PR
 *   - GITHUB_BEFORE_SHA: Pre-push commit SHA
 *
 * Outputs (written to GITHUB_OUTPUT):
 *   - go-changed: 'true' if any .go files changed
 *   - mod-changed: 'true' if go.mod or go.sum changed
 *   - mjs-changed: 'true' if any .mjs files changed (scripts)
 *   - docs-changed: 'true' if any .md files changed
 *   - workflow-changed: 'true' if any .github/workflows/ files changed
 *   - any-code-changed: 'true' if any code files changed (excludes docs, changesets, experiments, examples)
 */

import { appendFileSync } from "fs";
import { printUntrusted } from "./github-actions-log.mjs";

import { changedPaths, pullRequestRange, pushPaths } from "./git-comparison.mjs";

/**
 * Write output to GitHub Actions output file
 * @param {string} name - Output name
 * @param {string} value - Output value
 */
function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}\n`);
  }
  console.log(`${name}=${value}`);
}

/**
 * Get the list of changed files between two commits
 * @returns {string[]} Array of changed file paths
 */
function getChangedFiles() {
  const event = process.env.GITHUB_EVENT_NAME;
  if (event === "pull_request") {
    const range = pullRequestRange(
      process.env.GITHUB_BASE_SHA,
      process.env.GITHUB_HEAD_SHA
    );
    console.log(`Comparing PR: ${range}`);
    return changedPaths("diff", "--name-only", "--no-renames", "-z", range, "--");
  }

  return pushPaths(process.env.GITHUB_BEFORE_SHA, event);
}

/**
 * Check if a file should be excluded from code changes detection
 * @param {string} filePath - The file path to check
 * @returns {boolean} True if the file should be excluded
 */
function isExcludedFromCodeChanges(filePath) {
  // Exclude markdown files in any folder
  if (filePath.endsWith(".md")) {
    return true;
  }

  // Exclude specific folders from code changes
  const excludedFolders = [".changeset/", "docs/", "experiments/", "examples/"];

  for (const folder of excludedFolders) {
    if (filePath.startsWith(folder)) {
      return true;
    }
  }

  return false;
}

/**
 * Main function to detect changes
 */
function detectChanges() {
  console.log("Detecting file changes for CI/CD...\n");

  const changedFiles = getChangedFiles();

  console.log("Changed files:");
  if (changedFiles.length === 0) {
    console.log("  (none)");
  } else {
    changedFiles.forEach((file) => printUntrusted(`  ${file}`));
  }
  console.log("");

  // Detect .go file changes
  const goChanged = changedFiles.some((file) => file.endsWith(".go"));
  setOutput("go-changed", goChanged ? "true" : "false");

  // Detect go.mod/go.sum changes
  const modChanged = changedFiles.some(
    (file) => file === "go.mod" || file === "go.sum"
  );
  setOutput("mod-changed", modChanged ? "true" : "false");

  // Detect .mjs file changes (scripts)
  const mjsChanged = changedFiles.some((file) => file.endsWith(".mjs"));
  setOutput("mjs-changed", mjsChanged ? "true" : "false");

  // Detect documentation changes (any .md file)
  const docsChanged = changedFiles.some((file) => file.endsWith(".md"));
  setOutput("docs-changed", docsChanged ? "true" : "false");

  // Detect workflow changes
  const workflowChanged = changedFiles.some((file) =>
    file.startsWith(".github/workflows/")
  );
  setOutput("workflow-changed", workflowChanged ? "true" : "false");

  // Detect code changes (excluding docs, changesets, experiments, examples folders, and markdown files)
  const codeChangedFiles = changedFiles.filter(
    (file) => !isExcludedFromCodeChanges(file)
  );

  console.log("\nFiles considered as code changes:");
  if (codeChangedFiles.length === 0) {
    console.log("  (none)");
  } else {
    codeChangedFiles.forEach((file) => printUntrusted(`  ${file}`));
  }
  console.log("");

  // Check if any code files changed (.go, .mod, .sum, .mjs, .yml, .yaml, or workflow files)
  const codePattern = /\.(go|mod|sum|mjs|yml|yaml)$|\.github\/workflows\//;
  const codeChanged = codeChangedFiles.some((file) => codePattern.test(file));
  setOutput("any-code-changed", codeChanged ? "true" : "false");

  console.log("\nChange detection completed.");
}

try {
  detectChanges();
} catch (error) {
  console.error("::error::Could not establish changed files");
  printUntrusted(error.message, { stream: process.stderr });
  process.exitCode = 1;
}
