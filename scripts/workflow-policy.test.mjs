import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { describe, test } from "node:test";

const WORKFLOW_DIRECTORY = ".github/workflows";
const RELEASE_WORKFLOW = `${WORKFLOW_DIRECTORY}/release.yml`;

function readWorkflow(path = RELEASE_WORKFLOW) {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

function workflowPaths() {
  return readdirSync(WORKFLOW_DIRECTORY)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => `${WORKFLOW_DIRECTORY}/${file}`);
}

function jobBlock(workflow, name) {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.notEqual(start, -1, `missing job ${name}`);
  const relativeEnd = lines
    .slice(start + 1)
    .findIndex((line) => /^  [a-zA-Z0-9_-]+:\s*$/.test(line));
  const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
  return lines.slice(start, end).join("\n");
}

function runScripts(workflow) {
  const lines = workflow.split("\n");
  const scripts = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const block = line.match(/^(\s*)run:\s*[|>][-+]?\s*$/);
    if (block) {
      const keyIndent = block[1].length;
      const body = [];
      for (index += 1; index < lines.length; index += 1) {
        const bodyLine = lines[index];
        if (bodyLine.trim() && bodyLine.match(/^\s*/)[0].length <= keyIndent) {
          index -= 1;
          break;
        }
        body.push(bodyLine);
      }
      scripts.push(body.join("\n"));
      continue;
    }

    const inline = line.match(/^\s*run:\s+(.+)$/);
    if (inline) scripts.push(inline[1]);
  }

  return scripts;
}

describe("release workflow policy", () => {
  const workflow = readWorkflow();

  test("keeps cancellation away from release writers", () => {
    assert.doesNotMatch(workflow, /^concurrency:/m);
    for (const name of ["auto-release", "instant-release", "changeset-release"]) {
      const job = jobBlock(workflow, name);
      assert.match(job, /group: main-writer-\$\{\{ github\.repository \}\}-main/);
      assert.match(job, /cancel-in-progress: false/);
      assert.match(job, /queue: max/);
    }
  });

  test("propagates cancellation through the test dependency graph", () => {
    const testJob = jobBlock(workflow, "test");
    assert.match(testJob, /!cancelled\(\)/);
    assert.doesNotMatch(testJob, /always\(\)/);
  });

  test("grants write permission only to release writers", () => {
    const beforeJobs = workflow.slice(0, workflow.indexOf("\njobs:"));
    assert.match(beforeJobs, /permissions:\n  contents: read/);
    assert.doesNotMatch(beforeJobs, /contents: write|pull-requests: write/);

    for (const name of ["auto-release", "instant-release", "changeset-release"]) {
      const job = jobBlock(workflow, name);
      assert.match(job, /permissions:\n      contents: write/);
    }
  });

  test("makes Codecov behavior explicit and deterministic", () => {
    const testJob = jobBlock(workflow, "test");
    assert.match(testJob, /CODECOV_TOKEN: \$\{\{ secrets\.CODECOV_TOKEN \}\}/);
    assert.match(testJob, /codecov\/codecov-action@[0-9a-f]{40} # v7/);
    assert.match(testJob, /token: \$\{\{ env\.CODECOV_TOKEN \}\}/);
    assert.match(testJob, /disable_search: true/);
    assert.match(testJob, /fail_ci_if_error: true/);
    assert.doesNotMatch(testJob, /continue-on-error:/);
    assert.match(testJob, /CODECOV_TOKEN is not configured/);
  });

  test("passes every expression to shell scripts through the environment", () => {
    for (const path of workflowPaths()) {
      for (const script of runScripts(readWorkflow(path))) {
        assert.doesNotMatch(
          script,
          /\$\{\{/,
          `${path} interpolates an expression directly into a run block`
        );
      }
    }
  });

  test("quotes every GITHUB_OUTPUT redirection", () => {
    for (const script of runScripts(workflow)) {
      assert.doesNotMatch(script, />>\s+\$GITHUB_OUTPUT\b/);
    }
  });

  test("verifies every published version before creating its release", () => {
    for (const name of ["auto-release", "instant-release", "changeset-release"]) {
      const job = jobBlock(workflow, name);
      const verify = job.indexOf("name: Verify module availability");
      const announce = job.indexOf("name: Create GitHub Release");
      assert.ok(verify >= 0, `${name} does not verify module availability`);
      assert.ok(announce > verify, `${name} announces before verification`);
    }
  });
  test("recovers a tagged release after its changesets have been consumed", () => {
    const job = jobBlock(workflow, "auto-release");
    assert.match(job, /name: Check for missing release/);
    assert.match(
      job,
      /if: steps\.check_changesets\.outputs\.has_changesets == 'false'/
    );
    assert.match(job, /run: bun scripts\/check-release-needed\.mjs/);
    for (const step of [
      "Verify module availability",
      "Create GitHub Release",
    ]) {
      const block = job
        .slice(job.indexOf(`name: ${step}`))
        .split(/\n      - name:/)[0];
      assert.match(block, /steps\.recovery\.outputs\.release_needed == 'true'/);
      assert.doesNotMatch(block, /has_changesets/);
    }
  });

  test("ends with a status gate that explains every failure", () => {
    const job = jobBlock(workflow, "pipeline-status");
    const jobs = [...workflow.slice(workflow.indexOf("\njobs:")).matchAll(/^  ([a-zA-Z0-9_-]+):\s*$/gm)]
      .map((match) => match[1])
      .filter((name) => name !== "pipeline-status");
    for (const name of jobs)
      assert.match(job, new RegExp(`\\b${name},`), `gate does not need ${name}`);
    assert.match(job, /if: always\(\)/);
    assert.match(job, /permissions:\n      actions: read\n      checks: read\n      contents: read/);
    assert.match(job, /NEEDS_JSON: \$\{\{ toJSON\(needs\) \}\}/);
    assert.match(job, /run: bun scripts\/ci\/check-pipeline-status\.mjs/);
  });

  test("does not require changesets from Dependabot pin bumps", () => {
    const job = jobBlock(workflow, "changeset-check");
    assert.match(
      job,
      /github\.event\.pull_request\.user\.login != 'dependabot\[bot\]'/
    );
  });

  test("pins hosted runners and tool versions", () => {
    for (const path of workflowPaths()) {
      const source = readWorkflow(path);
      assert.doesNotMatch(source, /(?:ubuntu|macos|windows)-latest/);
      assert.doesNotMatch(source, /(?:bun-version|go-version):\s*['"]?latest/);
      assert.doesNotMatch(
        source,
        /uses: actions\/(?:checkout|setup-go)@v[45]\b/
      );
    }
  });
});

describe("infrastructure failure policy", () => {
  const rerun = readWorkflow(`${WORKFLOW_DIRECTORY}/rerun-unacquired.yml`);

  test("reruns only failed same-repository CI/CD runs", () => {
    const release = readWorkflow();
    const name = release.match(/^name: (.+)$/m)[1];
    assert.match(rerun, new RegExp(`workflows: \\['${name.replace(/[/]/g, "\\/")}'\\]`));
    assert.match(rerun, /types: \[completed\]/);
    assert.match(rerun, /github\.event\.workflow_run\.conclusion == 'failure'/);
    assert.match(
      rerun,
      /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/
    );
    assert.match(rerun, /run: >-\n\s+bun scripts\/ci\/rerun-unacquired\.mjs/);
  });

  test("never runs code from the triggering run and holds minimal permissions", () => {
    assert.match(rerun, /^permissions:\n  contents: read$/m);
    assert.match(rerun, /actions: write\n      checks: read\n      contents: read/);
    assert.match(rerun, /persist-credentials: false/);
    assert.doesNotMatch(rerun, /ref:|head_sha|head_branch|pull_requests/);
    assert.match(rerun, /timeout-minutes: 5/);
  });
});

describe("Dependabot policy", () => {
  test("proposes weekly grouped bumps for pinned actions", () => {
    const config = readFileSync(".github/dependabot.yml", "utf8");
    assert.match(config, /package-ecosystem: github-actions\n    directory: \//);
    assert.match(config, /interval: weekly/);
    assert.match(config, /cooldown:\n      default-days: 7/);
    assert.match(config, /patterns: \['\*'\]/);
  });
});
