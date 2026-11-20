import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), "release-comparison-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  const git = (...args) => execFileSync("git", args, {
    cwd, env: gitEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "CI Test");
  git("config", "user.email", "ci@example.invalid");

  const write = (file, contents) => {
    const path = join(cwd, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  };

  return {
    cwd,
    git,
    write,
    commit(file, contents = "test\n") {
      write(file, contents);
      git("add", "--", file);
      git("commit", "-qm", `Add ${file}`);
      return git("rev-parse", "HEAD");
    },
    run(script, env = {}, args = []) {
      const outputPath = join(cwd, "workflow-output");
      rmSync(outputPath, { force: true });
      const result = spawnSync(
        process.execPath,
        [resolve("scripts", `${script}.mjs`), ...args],
        {
          cwd,
          encoding: "utf8",
          env: {
            ...gitEnv,
            GITHUB_ACTIONS: "false",
            GITHUB_EVENT_NAME: "",
            GITHUB_BASE_SHA: "",
            GITHUB_HEAD_SHA: "",
            GITHUB_BASE_REF: "",
            GITHUB_BEFORE_SHA: "",
            BASE_SHA: "",
            HEAD_SHA: "",
            GITHUB_OUTPUT: outputPath,
            ...env,
          },
        }
      );
      if (result.error) throw result.error;
      return {
        ...result,
        outputs: existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "",
      };
    },
  };
}

const detect = "detect-code-changes";
const validChangeset = "---\n'go-ai-driven-development-pipeline-template': patch\n---\n\nTest change\n";

test("uses the tree of a genuine initial commit", (t) => {
  const repo = repository(t);
  repo.commit("pkg/sample.go");
  const result = repo.run(detect, {
    GITHUB_EVENT_NAME: "push",
    GITHUB_BEFORE_SHA: "0".repeat(40),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.outputs, /any-code-changed=true/);
});

test("refuses to treat a shallow HEAD as a root commit", (t) => {
  const repo = repository(t);
  const shallow = repository(t);
  repo.commit("pkg/sample.go");
  repo.commit("README.md");
  shallow.git("fetch", "--depth=1", pathToFileURL(repo.cwd).href, "main");
  shallow.git("checkout", "--detach", "FETCH_HEAD");
  const result = shallow.run(detect);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /Could not establish changed files/);
  assert.equal(result.outputs, "");
});

test("uses the full push range even when the last commit only changes docs", (t) => {
  const repo = repository(t);
  const before = repo.commit("README.md");
  repo.commit("pkg/sample.go");
  repo.commit("docs/extra.md");
  const env = { GITHUB_EVENT_NAME: "push", GITHUB_BEFORE_SHA: before };
  const result = repo.run(detect, env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.outputs, /any-code-changed=true/);

  for (const before of ["", "0".repeat(40), "1".repeat(40)]) {
    const unknown = repo.run(detect, { ...env, GITHUB_BEFORE_SHA: before });
    assert.equal(unknown.status, 1, unknown.stdout);
    assert.match(unknown.stderr, /Could not establish changed files/);
    assert.equal(unknown.outputs, "");
  }
});

test("classifies a complete PR comparison, including code before its last commit", (t) => {
  const repo = repository(t);
  repo.commit("README.md");
  repo.git("checkout", "-qb", "topic");
  const docsHead = repo.commit("docs/extra.md");
  repo.commit("pkg/sample.go");
  const codeHead = repo.commit("docs/extra.md", "another docs edit\n");
  repo.git("checkout", "-q", "main");
  const base = repo.commit("pkg/base-only.go");
  const env = { GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_SHA: base };

  const docs = repo.run(detect, { ...env, GITHUB_HEAD_SHA: docsHead });
  assert.equal(docs.status, 0, docs.stderr);
  assert.match(docs.outputs, /docs-changed=true/);
  assert.match(docs.outputs, /any-code-changed=false/);

  const code = repo.run(detect, { ...env, GITHUB_HEAD_SHA: codeHead });
  assert.equal(code.status, 0, code.stderr);
  assert.match(code.outputs, /any-code-changed=true/);
});

test("fails an unavailable PR comparison even with docs-only HEAD and a local changeset", (t) => {
  const repo = repository(t);
  const base = repo.commit(".changeset/existing.md", validChangeset);
  const head = repo.commit("README.md");
  const env = { GITHUB_EVENT_NAME: "pull_request", GITHUB_BASE_SHA: base, GITHUB_HEAD_SHA: head };
  for (const broken of [{ GITHUB_BASE_SHA: "1".repeat(40) }, { GITHUB_HEAD_SHA: "" }]) {
    const detection = repo.run(detect, { ...env, ...broken });
    assert.equal(detection.status, 1, detection.stdout);
    assert.match(detection.stderr, /Could not establish changed files/);
    assert.equal(detection.outputs, "");

    const validation = repo.run("validate-changeset", { ...env, ...broken });
    assert.equal(validation.status, 1, validation.stdout);
    assert.match(validation.stderr, /Unexpected error during changeset validation/);
  }
});

test("fails the PR diff when both commits exist but have no merge base", (t) => {
  const repo = repository(t);
  const base = repo.commit("README.md");
  repo.git("checkout", "--orphan", "unrelated");
  repo.git("rm", "-q", "--cached", "README.md");
  const head = repo.commit("docs/extra.md");

  const result = repo.run(detect, {
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_BASE_SHA: base,
    GITHUB_HEAD_SHA: head,
  });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /no merge base/i);
  assert.equal(result.outputs, "");
});

test("validates only changesets added by the PR", (t) => {
  const repo = repository(t);
  repo.commit(".changeset/preexisting.md", validChangeset);
  repo.git("checkout", "-qb", "topic");
  const head = repo.commit(".changeset/new.md", validChangeset);
  repo.git("checkout", "-q", "main");
  const base = repo.commit(".changeset/base-only.md", validChangeset);
  repo.git("merge", "--no-edit", "topic");

  const result = repo.run("validate-changeset", {
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_BASE_SHA: base,
    GITHUB_HEAD_SHA: head,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Found 1 changeset file\(s\)/);
  assert.match(result.stdout, /new\.md/);
});

test("stops versioning before commit, tagging or pushing if the staged diff fails", (t) => {
  const repo = repository(t);
  repo.write("pkg/mypackage/mypackage.go", 'package mypackage\nconst Version = "1.0.0"\n');
  repo.write("bin/git", `#!/bin/sh
echo "$1" >> git-invocations
case "$1" in
  add|config) exit 0 ;;
  diff) echo "fatal: comparison failed" >&2; exit 128 ;;
  *) exit 1 ;;
esac
`);
  chmodSync(join(repo.cwd, "bin/git"), 0o755);
  const result = repo.run("version-and-commit", {
    PATH: `${join(repo.cwd, "bin")}:${process.env.PATH}`,
  }, ["--mode", "instant", "--bump-type", "patch"]);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /fatal: comparison failed/);
  assert.doesNotMatch(readFileSync(join(repo.cwd, "git-invocations"), "utf8"), /commit|tag|push/);
  assert.equal(result.outputs, "");
});
