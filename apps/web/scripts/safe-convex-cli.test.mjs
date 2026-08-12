import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convexArguments, unsafeConvexDeployReason } from "./safe-convex-cli.mjs";

describe("safe Convex CLI", () => {
  for (const flag of ["--verbose", "-v", "--debug", "--write-push-request=/tmp/push.json", "--admin-key=value"]) {
    it(`blocks unsafe diagnostic or credential flag ${flag}`, () => {
      assert.ok(unsafeConvexDeployReason([flag], {}));
    });
  }

  it("blocks hidden verbosity from the environment", () => {
    assert.ok(unsafeConvexDeployReason(["--dry-run"], { CONVEX_VERBOSE: "1" }));
  });

  it("blocks secret values passed as command-line assignments", () => {
    assert.ok(unsafeConvexDeployReason(["RESEND_API_KEY=value"], {}));
  });

  it("allows normal and dry-run deploy arguments", () => {
    const args = ["--dry-run", "--typecheck", "enable", "--message", "release-check"];
    assert.equal(unsafeConvexDeployReason(args, {}), undefined);
    assert.deepEqual(convexArguments("deploy", args), ["deploy", ...args]);
  });

  it("forces environment inspection into names-only mode", () => {
    assert.deepEqual(convexArguments("env-names", ["--", "--prod"]), [
      "env",
      "list",
      "--names-only",
      "--prod",
    ]);
  });
});
