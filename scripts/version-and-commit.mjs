#!/usr/bin/env bun

/**
 * Complete version management workflow:
 * 1. Bump version in source code
 * 2. Collect changelog fragments
 * 3. Commit changes
 * 4. Create git tag
 * 5. Push to remote
 *
 * Usage:
 *   bun scripts/version-and-commit.mjs --bump-type <major|minor|patch>
 *
 * Examples:
 *   bun scripts/version-and-commit.mjs --bump-type patch
 *   bun scripts/version-and-commit.mjs --bump-type minor
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const VERSION_FILE = join(process.cwd(), "pkg", "mypackage", "mypackage.go");

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { bumpType: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--bump-type" && args[i + 1]) {
      result.bumpType = args[i + 1];
      i++;
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

function run(cmd) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: "inherit" });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

function main() {
  const { bumpType } = parseArgs();

  if (!bumpType) {
    console.error("Error: --bump-type is required (major, minor, or patch)");
    process.exit(1);
  }

  if (!["major", "minor", "patch"].includes(bumpType)) {
    console.error("Error: --bump-type must be major, minor, or patch");
    process.exit(1);
  }

  try {
    // Configure git for CI
    if (process.env.CI) {
      run('git config user.name "github-actions[bot]"');
      run('git config user.email "github-actions[bot]@users.noreply.github.com"');
    }

    // Get current and new version
    const currentVersion = getCurrentVersion();
    const newVersion = calculateNewVersion(currentVersion, bumpType);

    console.log(`\nBumping version: ${currentVersion} -> ${newVersion}\n`);

    // Update version in source code
    updateVersion(newVersion);
    console.log(`Updated version in ${VERSION_FILE}`);

    // Collect changelog fragments
    const collectScript = join(process.cwd(), "scripts", "collect-changelog.mjs");
    if (existsSync(collectScript)) {
      try {
        run(`bun "${collectScript}" --version ${newVersion}`);
      } catch (error) {
        console.log("No changelog fragments to collect");
      }
    }

    // Stage all changes
    run("git add -A");

    // Check if there are changes to commit
    try {
      runCapture("git diff --cached --quiet");
      console.log("No changes to commit");
    } catch {
      // There are changes, commit them
      run(`git commit -m "chore: release v${newVersion}"`);
    }

    // Create tag
    const tag = `v${newVersion}`;
    run(`git tag -a "${tag}" -m "Release ${tag}"`);

    // Push changes and tags
    run("git push");
    run("git push --tags");

    console.log(`\nSuccessfully released version ${newVersion}`);

    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `new_version=${newVersion}\n`);
      appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
