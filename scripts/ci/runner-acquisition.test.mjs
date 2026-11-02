import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  classifyJob,
  classifyJobs,
  listJobs,
  annotationMessages,
} from "./runner-acquisition.mjs";
import { decide } from "./rerun-unacquired.mjs";
import { evaluate, blockingNeeds } from "./check-pipeline-status.mjs";

// Shape of links-notation run 41477660740, job `kotlin / ios` (macos-26).
const NOT_ACQUIRED_MESSAGE =
  "The job was not acquired by Runner of type hosted even after multiple attempts";
const unacquired = {
  id: 1,
  name: "Test (macos-15)",
  status: "completed",
  conclusion: "cancelled",
  steps: [],
  runner_name: "",
};
const failedTest = {
  id: 2,
  name: "Test (ubuntu-24.04)",
  status: "completed",
  conclusion: "failure",
  steps: [{ name: "Run tests (Unix)", conclusion: "failure" }],
  runner_name: "GitHub Actions 7",
};
const superseded = {
  id: 3,
  name: "Test (windows-2025)",
  status: "completed",
  conclusion: "cancelled",
  steps: [],
  runner_name: "",
};
const gate = {
  id: 4,
  name: "Pipeline Status",
  status: "completed",
  conclusion: "failure",
  steps: [{ name: "Check pipeline status", conclusion: "failure" }],
  runner_name: "GitHub Actions 8",
};
const passed = { ...failedTest, id: 5, name: "Lint", conclusion: "success" };
const running = { id: 6, name: "Pipeline Status", status: "in_progress", conclusion: null };

const annotations = ({ job }) => (job.id === 1 ? [NOT_ACQUIRED_MESSAGE] : []);
const classify = (jobs) => classifyJobs({ repository: "o/r", jobs, annotations });

describe("runner acquisition classification", () => {
  test("only an annotated job without runner and steps is not-acquired", () => {
    assert.equal(classifyJob(unacquired, [NOT_ACQUIRED_MESSAGE]), "not-acquired");
    assert.equal(
      classifyJob({ ...unacquired, conclusion: "failure" }, [NOT_ACQUIRED_MESSAGE]),
      "not-acquired"
    );
    assert.equal(classifyJob(superseded, []), "not-started");
    assert.equal(classifyJob(superseded, undefined), "not-started");
    // A job that ran steps is a real failure whatever its annotations say.
    assert.equal(classifyJob(failedTest, [NOT_ACQUIRED_MESSAGE]), "failed");
  });

  test("ignores successful and running jobs and survives lookup errors", () => {
    const errors = [];
    const result = classifyJobs({
      repository: "o/r",
      jobs: [passed, running, unacquired, failedTest],
      annotations: () => {
        throw new Error("HTTP 502");
      },
      onLookupError: (job) => errors.push(job.id),
    });
    assert.deepEqual(
      result.map(({ job, kind }) => [job.name, kind]),
      [
        ["Test (macos-15)", "not-started"],
        ["Test (ubuntu-24.04)", "failed"],
      ]
    );
    assert.deepEqual(errors, [1]);
  });

  test("reads paginated jobs and annotations through gh", () => {
    const calls = [];
    const run = (args) => {
      calls.push(args.at(-1));
      return args.at(-1).includes("annotations")
        ? JSON.stringify([[{ message: "a" }], [{ message: "b" }]])
        : JSON.stringify([{ jobs: [unacquired] }, { jobs: [failedTest] }]);
    };
    assert.deepEqual(
      listJobs({ repository: "o/r", runId: "9", attempt: 2, run }).map((job) => job.id),
      [1, 2]
    );
    listJobs({ repository: "o/r", runId: "9", run });
    assert.deepEqual(annotationMessages({ repository: "o/r", job: unacquired, run }), [
      "a",
      "b",
    ]);
    assert.deepEqual(calls, [
      "repos/o/r/actions/runs/9/attempts/2/jobs?per_page=100",
      "repos/o/r/actions/runs/9/jobs?filter=latest&per_page=100",
      "repos/o/r/check-runs/1/annotations?per_page=100",
    ]);
  });
});

describe("rerun of runner-acquisition failures", () => {
  test("reruns when the only failures are unacquired jobs and the gate", () => {
    const result = decide(classify([passed, unacquired, gate]), { attempt: 1 });
    assert.equal(result.action, "rerun");
    assert.deepEqual(result.notAcquired, ["Test (macos-15)"]);
    assert.equal(decide(classify([unacquired, gate]), { attempt: 2 }).action, "rerun");
  });

  test("gives up after the maximum number of attempts", () => {
    assert.equal(decide(classify([unacquired]), { attempt: 3 }).action, "give-up");
    assert.equal(
      decide(classify([unacquired]), { attempt: 3, maxAttempts: 4 }).action,
      "rerun"
    );
  });

  test("never reruns a job that ran steps and failed", () => {
    const result = decide(classify([unacquired, failedTest, gate]), { attempt: 1 });
    assert.equal(result.action, "blocked");
    assert.deepEqual(result.others, ["Test (ubuntu-24.04)"]);
    assert.equal(decide(classify([failedTest, gate]), { attempt: 1 }).action, "nothing");
  });

  test("does not rerun jobs cancelled for other reasons", () => {
    assert.equal(decide(classify([superseded]), { attempt: 1 }).action, "nothing");
    assert.equal(
      decide(classify([unacquired, superseded]), { attempt: 1 }).action,
      "blocked"
    );
  });
});

describe("pipeline status gate", () => {
  function run(needs, jobs, readJobs) {
    const directory = mkdtempSync(join(tmpdir(), "pipeline-status-"));
    const summaryFile = join(directory, "summary.md");
    const chunks = [];
    try {
      const code = evaluate({
        needs,
        jobs: readJobs || (() => jobs),
        classify,
        summaryFile,
        githubActions: false,
        stdout: { write: (text) => chunks.push(text) },
      });
      let summary = "";
      try {
        summary = readFileSync(summaryFile, "utf8");
      } catch {}
      return { code, output: chunks.join(""), summary };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  test("passes when every need succeeded or was skipped", () => {
    const result = run(
      { lint: { result: "success" }, "auto-release": { result: "skipped" } },
      []
    );
    assert.equal(result.code, 0);
    assert.equal(result.summary, "");
    assert.deepEqual(blockingNeeds({ a: { result: "skipped" } }), []);
  });

  test("reports an unacquired runner as infrastructure, not code", () => {
    const result = run({ test: { result: "failure" } }, [passed, unacquired, running]);
    assert.equal(result.code, 1);
    assert.match(result.output, /::error title=Hosted runner not acquired::1 job/);
    assert.doesNotMatch(result.output, /title=Pipeline failed/);
    assert.match(result.output, /Test \(macos-15\) \(cancelled\): Hosted runner not acquired/);
    assert.match(result.summary, /\*\*Hosted runner not acquired\*\*: `Test \(macos-15\)/);
  });

  test("reports code failures separately from infrastructure failures", () => {
    const result = run({ test: { result: "failure" } }, [unacquired, failedTest]);
    assert.equal(result.code, 1);
    assert.match(result.output, /title=Hosted runner not acquired/);
    assert.match(result.output, /title=Pipeline failed/);
    assert.match(result.output, /Test \(ubuntu-24\.04\) \(failure\): Failed while running/);
  });

  test("still fails when the jobs cannot be read", () => {
    const result = run({ build: { result: "cancelled" } }, [], () => {
      throw new Error("HTTP 403");
    });
    assert.equal(result.code, 1);
    assert.match(result.output, /::warning::Could not read this run's jobs/);
    assert.match(result.output, /title=Pipeline failed/);
    assert.match(result.summary, /`build \(cancelled\)`/);
  });
});
