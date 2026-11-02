import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  findDependencies,
  checkDependencies,
  report,
} from "./check-dependencies.mjs";

function sink() {
  const chunks = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join("") };
}

function run(errors, event) {
  const directory = mkdtempSync(join(tmpdir(), "check-dependencies-"));
  const summaryFile = join(directory, "summary.md");
  const stdout = sink();
  const stderr = sink();
  try {
    const code = report(errors, {
      event,
      total: 5,
      summaryFile,
      stdout,
      stderr,
      githubActions: false,
    });
    let summary = "";
    try {
      summary = readFileSync(summaryFile, "utf8");
    } catch {}
    return { code, stdout: stdout.text(), stderr: stderr.text(), summary };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const stalePin = {
  stale: true,
  message:
    ".github/workflows/workflows.yml:36: oven-sh/bun pins 1.4.2; latest stable is 1.4.4",
};
const brokenPin = {
  stale: false,
  message:
    ".github/workflows/workflows.yml:30: actions/checkout: Pinned SHA does not match the release tag",
};

const sha = "1".repeat(40);
const digest = "2".repeat(64);
const workflow = `
      - uses: actions/checkout@${sha} # v7.0.1
      - uses: docker://rhysd/actionlint@sha256:${digest} # v1.7.12
        bun-version: '1.4.2'
        go-version: '1.27.1'
        run: go install honnef.co/go/tools/cmd/staticcheck@2026.2.1
`;

describe("CI dependency freshness", () => {
  test("discovers action, container, Bun, Go and staticcheck pins", () => {
    const dependencies = findDependencies([
      { path: "test.yml", source: workflow },
    ]);
    assert.deepEqual(
      dependencies.map((dependency) => dependency.name),
      [
        "actions/checkout",
        "rhysd/actionlint",
        "oven-sh/bun",
        "go",
        "dominikh/go-tools",
      ]
    );
    assert.equal(dependencies[0].ref, sha);
    assert.equal(dependencies[1].ref, `sha256:${digest}`);
    assert.equal(dependencies[2].version, "1.4.2");
  });

  test("rejects mutable actions, missing version comments and floating tools", () => {
    for (const source of [
      "- uses: actions/checkout@v7",
      `- uses: actions/checkout@${sha}`,
      "bun-version: latest",
      "go-version: '1.27'",
      "run: go install honnef.co/go/tools/cmd/staticcheck@latest",
      "- uses: docker://rhysd/actionlint:1.7.12",
    ])
      assert.throws(
        () => findDependencies([{ path: "test.yml", source }]),
        /pin/i
      );
  });

  test("fails on an outdated tool and verifies action and image integrity", async () => {
    const dependencies = findDependencies([
      { path: "test.yml", source: workflow },
    ]);
    const checked = [];
    const versions = {
      "actions/checkout": "7.0.1",
      "rhysd/actionlint": "1.7.12",
      "oven-sh/bun": "1.4.3",
      go: "1.27.1",
      "dominikh/go-tools": "2026.2.1",
    };
    const errors = await checkDependencies(dependencies, {
      latest: async (dependency) => versions[dependency.name],
      verifyPin: async (dependency) => checked.push(dependency.name),
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].stale, true);
    assert.match(errors[0].message, /oven-sh\/bun.*1\.4\.2.*1\.4\.3/);
    assert.deepEqual(checked, ["actions/checkout", "rhysd/actionlint"]);
  });

  test("registry and integrity failures cannot silently pass", async () => {
    const dependencies = findDependencies([
      { path: "test.yml", source: workflow },
    ]).slice(0, 1);
    for (const failure of [
      "registry unavailable",
      "SHA does not match the release",
    ])
      assert.match(
        (
          await checkDependencies(dependencies, {
            latest: async () => {
              if (failure === "registry unavailable") throw new Error(failure);
              return "7.0.1";
            },
            verifyPin: async () => {
              throw new Error(failure);
            },
          })
        )[0].message,
        new RegExp(failure)
      );
  });
});

describe("CI dependency gate by event", () => {
  test("a stale pin fails pull requests and local runs", () => {
    for (const event of ["pull_request", undefined]) {
      const result = run([stalePin], event);
      assert.equal(result.code, 1, `event ${event}`);
      assert.match(result.stderr, /::error::CI dependencies need attention/);
      assert.match(result.stderr, /oven-sh\/bun pins 1\.4\.2/);
      assert.doesNotMatch(result.stdout, /::warning/);
      assert.match(result.summary, /### Failing \(1\)/);
    }
  });

  test("a stale pin only warns on push, schedule and workflow_dispatch", () => {
    for (const event of ["push", "schedule", "workflow_dispatch"]) {
      const result = run([stalePin], event);
      assert.equal(result.code, 0, `event ${event}`);
      assert.equal(result.stderr, "");
      assert.match(result.stdout, /^::warning title=Newer CI dependency releases::1 /);
      assert.match(result.stdout, /oven-sh\/bun pins 1\.4\.2; latest stable is 1\.4\.4/);
      assert.match(result.summary, /Newer upstream releases \(warning on `/);
      assert.match(result.summary, /- `.*oven-sh\/bun pins 1\.4\.2/);
      assert.doesNotMatch(result.summary, /Failing/);
    }
  });

  test("integrity and lookup failures fail on every event", () => {
    for (const event of ["pull_request", "push", "schedule", "workflow_dispatch"]) {
      const result = run([stalePin, brokenPin], event);
      assert.equal(result.code, 1, `event ${event}`);
      assert.match(result.stderr, /Pinned SHA does not match/);
    }
  });

  test("current pins pass quietly without a summary", () => {
    const result = run([], "pull_request");
    assert.equal(result.code, 0);
    assert.match(result.stdout, /All 5 CI dependency pins match/);
    assert.equal(result.summary, "");
  });
});
