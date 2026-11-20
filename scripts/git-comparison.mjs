import { execFileSync } from "node:child_process";

export function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function requireCommit(sha, label) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(sha ?? ""))
    throw new Error(`A full ${label} commit SHA is required`);

  try {
    git("cat-file", "-e", `${sha}^{commit}`);
  } catch {
    console.log(`Fetching the missing ${label} commit from origin`);
    git("fetch", "--no-tags", "origin", sha);
  }
}

export function pullRequestRange(base, head) {
  requireCommit(base, "PR base");
  requireCommit(head, "PR head");
  return `${base}...${head}`;
}

export function changedPaths(...args) {
  return git(...args).split("\0").filter(Boolean);
}

export function pushPaths(before, event) {
  if (before && !/^(?:0{40}|0{64})$/.test(before)) {
    requireCommit(before, "pre-push");
    return changedPaths("diff", "--name-only", "--no-renames", "-z", before, "HEAD", "--");
  }

  // Inspect the commit object so a missing parent in a shallow clone stays an error.
  const headers = git("cat-file", "commit", "HEAD").split("\n\n", 1)[0];
  if (!/^parent /m.test(headers))
    return changedPaths("ls-tree", "--name-only", "-r", "-z", "HEAD");

  if (before)
    throw new Error("A new ref with a non-root HEAD has no pre-push commit to compare");
  if (event === "push")
    throw new Error("The pre-push commit SHA is required for a non-root push");
  return changedPaths("diff", "--name-only", "--no-renames", "-z", "HEAD^", "HEAD", "--");
}
