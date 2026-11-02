#!/usr/bin/env bun

// Rerun a CI run whose only failures are jobs that never got a hosted runner
// (issue #14). `gh run rerun --failed` also reruns the jobs that depend on
// them, so the build, release and status gates are evaluated again.
//
// - Only jobs carrying GitHub's "was not acquired by Runner" annotation, with
//   no runner and no steps, count as infrastructure failures.
// - A run that also has a job which ran steps and failed (or was cancelled for
//   another reason) is never rerun: the code has to be fixed first.
// - At most MAX_ATTEMPTS attempts are made (two automatic reruns by default);
//   after that the script fails with the command a maintainer can run later.
//
// Usage:
//   bun scripts/ci/rerun-unacquired.mjs --repository OWNER/REPO --run-id ID \
//     --attempt N [--max-attempts 3] [--gate-job "Pipeline Status"] [--dry-run]
// Set CI_VERBOSE=true to trace job classification.
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { printUntrusted } from "../github-actions-log.mjs";
import { classifyJobs, listJobs } from "./runner-acquisition.mjs";

export const MAX_ATTEMPTS = 3;
export const GATE_JOBS = ["Pipeline Status"];

/**
 * Decide what to do with a run attempt.
 *
 * @param {{job: {name: string}, kind: string}[]} classified
 * @returns {{action: "nothing" | "blocked" | "give-up" | "rerun",
 *   notAcquired: string[], others: string[]}}
 */
export function decide(
  classified,
  { attempt, maxAttempts = MAX_ATTEMPTS, gateJobs = GATE_JOBS }
) {
  const notAcquired = classified
    .filter(({ kind }) => kind === "not-acquired")
    .map(({ job }) => job.name);
  // A status gate fails because of the other jobs, so it never blocks a rerun.
  const others = classified
    .filter(
      ({ job, kind }) => kind !== "not-acquired" && !gateJobs.includes(job.name)
    )
    .map(({ job }) => job.name);
  let action = "rerun";
  if (!notAcquired.length) action = "nothing";
  else if (others.length) action = "blocked";
  else if (attempt >= maxAttempts) action = "give-up";
  return { action, notAcquired, others };
}

function main() {
  const { values } = parseArgs({
    options: {
      repository: { type: "string" },
      "run-id": { type: "string" },
      attempt: { type: "string" },
      "max-attempts": { type: "string", default: String(MAX_ATTEMPTS) },
      "gate-job": { type: "string", multiple: true, default: GATE_JOBS },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const repository = values.repository;
  const runId = values["run-id"];
  const attempt = Number(values.attempt);
  const maxAttempts = Number(values["max-attempts"]);
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository || "") ||
    !/^\d+$/.test(runId || "") ||
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    !Number.isInteger(maxAttempts)
  )
    throw new Error(
      "--repository OWNER/REPO, a numeric --run-id and --attempt are required"
    );
  const verbose = process.env.CI_VERBOSE === "true";

  const jobs = listJobs({ repository, runId, attempt });
  const classified = classifyJobs({
    repository,
    jobs,
    onLookupError: (job, error) => {
      console.log(
        `::warning::Could not read annotations of job ${job.id}; it is not treated as a runner-acquisition failure`
      );
      printUntrusted(error.message);
    },
  });
  if (verbose)
    for (const { job, kind } of classified)
      printUntrusted(`[rerun-unacquired] ${job.name}: ${job.conclusion}, ${kind}`);

  const { action, notAcquired, others } = decide(classified, {
    attempt,
    maxAttempts,
    gateJobs: values["gate-job"],
  });
  const command = `gh run rerun ${runId} --failed --repo ${repository}`;
  if (action === "nothing") {
    console.log(
      `Attempt ${attempt}: no job failed to acquire a hosted runner; leaving the run as it is.`
    );
    return 0;
  }
  // Job names come from the workflow, but are printed without command parsing.
  console.log(`Jobs without a hosted runner in attempt ${attempt}:`);
  printUntrusted(notAcquired.join("\n"));
  if (action === "blocked") {
    console.log(
      "::notice title=Not rerun::Other jobs failed while running their steps, so rerunning cannot make this run pass:"
    );
    printUntrusted(others.join("\n"));
    return 0;
  }
  if (action === "give-up") {
    console.log(
      `::error title=Hosted runner not acquired::No hosted runner after ${attempt} attempts. ` +
        `GitHub runner capacity is outside this repository; rerun later with: ${command}`
    );
    return 1;
  }
  console.log(
    `::warning title=Hosted runner not acquired::Attempt ${attempt} could not get a hosted runner; ` +
      "rerunning the failed jobs and the jobs that depend on them"
  );
  if (values["dry-run"]) console.log(`Dry run: ${command}`);
  else
    execFileSync("gh", ["run", "rerun", runId, "--failed", "--repo", repository], {
      stdio: "inherit",
    });
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error("::error::Could not inspect the run for runner-acquisition failures");
    printUntrusted(error.message, { stream: process.stderr });
    process.exitCode = 1;
  }
}
