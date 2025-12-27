#!/usr/bin/env bun

/**
 * Collects changelog fragments from changelog.d/ and inserts them into CHANGELOG.md
 *
 * Usage:
 *   bun scripts/collect-changelog.mjs [--version <version>]
 *
 * If --version is not provided, reads from pkg/mypackage/mypackage.go
 */

import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from "fs";
import { join, basename } from "path";

const CHANGELOG_DIR = join(process.cwd(), "changelog.d");
const CHANGELOG_FILE = join(process.cwd(), "CHANGELOG.md");
const VERSION_FILE = join(process.cwd(), "pkg", "mypackage", "mypackage.go");

function parseArgs() {
  const args = process.argv.slice(2);
  let version = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--version" && args[i + 1]) {
      version = args[i + 1];
      i++;
    }
  }

  return { version };
}

function getCurrentVersion() {
  const content = readFileSync(VERSION_FILE, "utf-8");
  const match = content.match(/const Version = "(\d+\.\d+\.\d+)"/);

  if (!match) {
    throw new Error(`Could not find version in ${VERSION_FILE}`);
  }

  return match[1];
}

function getFragments() {
  if (!existsSync(CHANGELOG_DIR)) {
    return [];
  }

  const files = readdirSync(CHANGELOG_DIR);
  const fragments = [];

  for (const file of files) {
    if (file.endsWith(".md") && file !== "README.md") {
      const filePath = join(CHANGELOG_DIR, file);
      const content = readFileSync(filePath, "utf-8").trim();
      fragments.push({ file, filePath, content });
    }
  }

  // Sort by filename (which includes timestamp) for chronological order
  fragments.sort((a, b) => a.file.localeCompare(b.file));

  return fragments;
}

function formatDate() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function updateChangelog(version, fragments) {
  const date = formatDate();
  let newEntry = `## [${version}] - ${date}\n\n`;

  for (const fragment of fragments) {
    newEntry += fragment.content + "\n\n";
  }

  let changelog;
  if (existsSync(CHANGELOG_FILE)) {
    changelog = readFileSync(CHANGELOG_FILE, "utf-8");
  } else {
    changelog = "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n";
  }

  // Try to find insertion point
  const insertMarker = "<!-- changelog-insert-here -->";
  const versionHeadingPattern = /^## \[/m;

  if (changelog.includes(insertMarker)) {
    // Insert after the marker
    changelog = changelog.replace(insertMarker, insertMarker + "\n\n" + newEntry);
  } else if (versionHeadingPattern.test(changelog)) {
    // Insert before the first version heading
    changelog = changelog.replace(versionHeadingPattern, newEntry + "## [");
  } else {
    // Append to the end
    changelog = changelog.trimEnd() + "\n\n" + newEntry;
  }

  writeFileSync(CHANGELOG_FILE, changelog);
}

function deleteFragments(fragments) {
  for (const fragment of fragments) {
    unlinkSync(fragment.filePath);
    console.log(`Deleted: ${fragment.file}`);
  }
}

function main() {
  let { version } = parseArgs();

  if (!version) {
    version = getCurrentVersion();
  }

  console.log(`Collecting changelog for version ${version}...`);

  try {
    const fragments = getFragments();

    if (fragments.length === 0) {
      console.log("No changelog fragments found.");
      return;
    }

    console.log(`Found ${fragments.length} fragment(s)`);

    updateChangelog(version, fragments);
    console.log(`Updated ${CHANGELOG_FILE}`);

    deleteFragments(fragments);
    console.log("Changelog collection complete.");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
