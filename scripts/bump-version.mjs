#!/usr/bin/env bun

/**
 * Bumps the version in pkg/mypackage/mypackage.go
 *
 * Usage:
 *   bun scripts/bump-version.mjs --bump-type <major|minor|patch> [--dry-run]
 *
 * Examples:
 *   bun scripts/bump-version.mjs --bump-type patch
 *   bun scripts/bump-version.mjs --bump-type minor --dry-run
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const VERSION_FILE = join(
  process.cwd(),
  "pkg",
  "mypackage",
  "mypackage.go"
);

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { bumpType: null, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--bump-type" && args[i + 1]) {
      result.bumpType = args[i + 1];
      i++;
    } else if (args[i] === "--dry-run") {
      result.dryRun = true;
    }
  }

  return result;
}

function getCurrentVersion() {
  const content = readFileSync(VERSION_FILE, "utf-8");
  const match = content.match(/const Version = "(\d+\.\d+\.\d+)"/);

  if (!match) {
    throw new Error(`Could not find version in ${VERSION_FILE}`);
  }

  return match[1];
}

function calculateNewVersion(currentVersion, bumpType) {
  const [major, minor, patch] = currentVersion.split(".").map(Number);

  switch (bumpType) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${bumpType}`);
  }
}

function updateVersion(newVersion) {
  let content = readFileSync(VERSION_FILE, "utf-8");
  content = content.replace(
    /const Version = "\d+\.\d+\.\d+"/,
    `const Version = "${newVersion}"`
  );
  writeFileSync(VERSION_FILE, content);
}

function main() {
  const { bumpType, dryRun } = parseArgs();

  if (!bumpType) {
    console.error("Error: --bump-type is required (major, minor, or patch)");
    process.exit(1);
  }

  if (!["major", "minor", "patch"].includes(bumpType)) {
    console.error("Error: --bump-type must be major, minor, or patch");
    process.exit(1);
  }

  try {
    const currentVersion = getCurrentVersion();
    const newVersion = calculateNewVersion(currentVersion, bumpType);

    console.log(`Current version: ${currentVersion}`);
    console.log(`New version: ${newVersion}`);

    if (dryRun) {
      console.log("Dry run - no changes made");
    } else {
      updateVersion(newVersion);
      console.log(`Updated ${VERSION_FILE}`);
    }

    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      const fs = await import("fs");
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `new_version=${newVersion}\n`
      );
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
