import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runInNewContext } from "node:vm"

type ReleaseWorkflow = {
  jobs: {
    publish: {
      steps: Array<{ uses?: string; with?: { ref?: string } }>
    }
  }
}

function git(cwd: string, args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { cwd })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout.toString().trim()
}

function createReleaseRepository() {
  const directory = mkdtempSync(join(tmpdir(), "copper-pour-release-"))
  git(directory, ["init", "--initial-branch=main"])
  git(directory, ["config", "user.name", "Release test"])
  git(directory, ["config", "user.email", "release-test@example.com"])
  writeFileSync(join(directory, "package.json"), '{"version":"0.0.48"}\n')
  git(directory, ["add", "package.json"])
  git(directory, ["commit", "-m", "initial release"])
  git(directory, ["tag", "v0.0.48"])
  writeFileSync(join(directory, "package.json"), '{"version":"0.0.56"}\n')
  git(directory, ["commit", "-am", "subsequent changes"])
  return directory
}

function getCheckoutRef({
  release_tag,
  sha,
}: {
  release_tag: string
  sha: string
}): string {
  const workflow = Bun.YAML.parse(
    readFileSync(
      new URL("../.github/workflows/bun-pver-release.yml", import.meta.url),
      "utf8",
    ),
  ) as ReleaseWorkflow
  const checkout = workflow.jobs.publish.steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  )!
  // The checkout's simple || expression has the same semantics in JS and Actions.
  return runInNewContext(checkout.with!.ref!.slice(3, -2), {
    inputs: { release_tag },
    github: { sha },
  })
}

test("normal releases keep an attached main branch for committed version bump PRs", () => {
  const directory = createReleaseRepository()
  try {
    const sha = git(directory, ["rev-parse", "HEAD"])
    git(directory, ["checkout", getCheckoutRef({ release_tag: "", sha })])
    writeFileSync(join(directory, "package.json"), '{"version":"0.0.67"}\n')
    git(directory, ["commit", "-am", "v0.0.67"])

    // create-pull-request preserves commits made on a branch. With detached
    // HEAD it treats this new release commit as its base and drops the bump.
    expect(git(directory, ["symbolic-ref", "--short", "HEAD"])).toBe("main")
    expect(git(directory, ["rev-list", "--count", `${sha}..main`])).toBe("1")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("manual recovery checks out the requested historical release tag", () => {
  const directory = createReleaseRepository()
  try {
    const sha = git(directory, ["rev-parse", "HEAD"])
    git(directory, [
      "checkout",
      getCheckoutRef({ release_tag: "v0.0.48", sha }),
    ])
    expect(git(directory, ["describe", "--tags", "--exact-match"])).toBe(
      "v0.0.48",
    )
    expect(
      JSON.parse(readFileSync(join(directory, "package.json"), "utf8")),
    ).toEqual({ version: "0.0.48" })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
