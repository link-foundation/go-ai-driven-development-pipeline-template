#!/usr/bin/env bun

/**
 * Validate changeset for CI - ensures exactly one valid changeset is added by the PR
 *
 * Key behavior:
 * - Only checks changeset files ADDED by the current PR (not pre-existing ones)
 * - Uses git diff to compare PR head against base branch
 * - Validates that the PR adds exactly one changeset with proper format
 * - Falls back to checking all changesets for local development
 *
 * IMPORTANT: Update the package name below to match your project
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { changedPaths, pullRequestRange } from "./git-comparison.mjs";
import { printUntrusted } from "./github-actions-log.mjs";

// Package name for the Go module (used in changeset frontmatter)
const PACKAGE_NAME = "go-ai-driven-development-pipeline-template";
const CHANGESET_DIR = ".changeset";

/**
 * Get changesets added by the PR, or list local changesets without a PR context.
 * @returns {string[]} Array of added changeset file names
 */
function getAddedChangesetFiles() {
  const baseSha = process.env.GITHUB_BASE_SHA || process.env.BASE_SHA;
  const headSha = process.env.GITHUB_HEAD_SHA || process.env.HEAD_SHA;

  if (process.env.GITHUB_EVENT_NAME === "pull_request" || baseSha || headSha || process.env.GITHUB_BASE_REF) {
    const range = pullRequestRange(baseSha, headSha);
    console.log(`Comparing ${range}`);
    return changedPaths("diff", "--diff-filter=A", "--name-only", "-z", range, "--", CHANGESET_DIR)
      .filter((file) => file.endsWith(".md") && !file.endsWith("/README.md"))
      .map((file) => file.slice(CHANGESET_DIR.length + 1));
  }

  console.log("Checking changesets in the local directory");
  if (!existsSync(CHANGESET_DIR)) return [];
  return readdirSync(CHANGESET_DIR).filter(
    (file) => file.endsWith(".md") && file !== "README.md"
  );
}

/**
 * Validate a single changeset file
 * @param {string} filePath Full path to the changeset file
 * @returns {{valid: boolean, type?: string, description?: string, error?: string}}
 */
function validateChangesetFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");

    // Check if changeset has a valid type (major, minor, or patch)
    const versionTypeRegex = new RegExp(
      `^['"]${PACKAGE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]:\\s+(major|minor|patch)`,
      "m"
    );
    const versionTypeMatch = content.match(versionTypeRegex);

    if (!versionTypeMatch) {
      return {
        valid: false,
        error: `Changeset must specify a version type: major, minor, or patch\nExpected format:\n---\n'${PACKAGE_NAME}': patch\n---\n\nYour description here`,
      };
    }

    // Extract description (everything after the closing ---) and check it's not empty
    const parts = content.split("---");
    if (parts.length < 3) {
      return {
        valid: false,
        error:
          "Changeset must include a description of the changes (after the closing '---')",
      };
    }

    const description = parts.slice(2).join("---").trim();
    if (!description) {
      return {
        valid: false,
        error: "Changeset must include a non-empty description of the changes",
      };
    }

    return {
      valid: true,
      type: versionTypeMatch[1],
      description,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to read changeset file: ${error.message}`,
    };
  }
}

try {
  console.log("Validating changesets added by this PR...");

  // Get changeset files added in this PR
  const addedChangesetFiles = getAddedChangesetFiles();
  const changesetCount = addedChangesetFiles.length;

  console.log(`Found ${changesetCount} changeset file(s) added by this PR`);
  if (changesetCount > 0) {
    console.log("Added changesets:");
    addedChangesetFiles.forEach((file) => printUntrusted(`  - ${file}`));
  }

  // Ensure exactly one changeset file was added
  if (changesetCount === 0) {
    console.error(
      "::error::No changeset found in this PR. Please add a changeset file in .changeset/ directory."
    );
    console.error("\nExample changeset file (.changeset/my-change.md):");
    console.error("---");
    console.error(`'${PACKAGE_NAME}': patch`);
    console.error("---");
    console.error("\nDescription of your changes here.");
    process.exit(1);
  } else if (changesetCount > 1) {
    console.error(
      `::error::Multiple changesets found in this PR (${changesetCount}). Each PR should add exactly ONE changeset.`
    );
    console.error("::error::Found changeset files added by this PR:");
    addedChangesetFiles.forEach((file) =>
      printUntrusted(`  ${file}`, { stream: process.stderr })
    );
    console.error(
      "\n::error::Please combine these into a single changeset or remove the extras."
    );
    process.exit(1);
  }

  // Validate the single changeset file
  const changesetFile = join(CHANGESET_DIR, addedChangesetFiles[0]);
  console.log("Validating changeset:");
  printUntrusted(changesetFile);

  const validation = validateChangesetFile(changesetFile);

  if (!validation.valid) {
    console.error("::error::Changeset validation failed");
    printUntrusted(validation.error, { stream: process.stderr });
    console.error("\nInvalid changeset file:");
    printUntrusted(changesetFile, { stream: process.stderr });
    console.error("File content:");
    try {
      printUntrusted(readFileSync(changesetFile, "utf-8"), {
        stream: process.stderr,
      });
    } catch {
      console.error("(could not read file)");
    }
    process.exit(1);
  }

  console.log("Changeset validation passed");
  console.log(`   Type: ${validation.type}`);
  console.log("   Description:");
  printUntrusted(validation.description);
} catch (error) {
  console.error("::error::Unexpected error during changeset validation");
  printUntrusted(error.message, { stream: process.stderr });
  if (process.env.DEBUG) {
    console.error("Stack trace:");
    printUntrusted(error.stack, { stream: process.stderr });
  }
  process.exit(1);
}
