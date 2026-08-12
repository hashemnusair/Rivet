#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BLOCKED_DEPLOY_FLAGS = new Set([
  "-v",
  "--verbose",
  "--debug",
  "--write-push-request",
  "--admin-key",
]);

const SENSITIVE_ASSIGNMENT = /(?:^|_)(?:API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|DEPLOY_KEY)=/i;

export function unsafeConvexDeployReason(args, environment = process.env) {
  if (environment.CONVEX_VERBOSE !== undefined) {
    return "CONVEX_VERBOSE enables diagnostic output that is unsafe around deployment secrets";
  }

  for (const argument of args) {
    const flag = argument.includes("=") ? argument.slice(0, argument.indexOf("=")) : argument;
    if (BLOCKED_DEPLOY_FLAGS.has(flag)) {
      return `${flag} is blocked by the RIVET safe Convex deploy wrapper`;
    }
    if (SENSITIVE_ASSIGNMENT.test(argument)) {
      return "secret assignments must never be passed as command-line arguments";
    }
  }

  return undefined;
}

export function convexArguments(mode, args) {
  const normalizedArgs = args.filter((argument) => argument !== "--");
  if (mode === "deploy") return ["deploy", ...normalizedArgs];
  if (mode === "env-names") return ["env", "list", "--names-only", ...normalizedArgs];
  throw new Error(`Unsupported safe Convex mode: ${mode}`);
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const unsafeReason = unsafeConvexDeployReason(args);
  if (unsafeReason) {
    console.error(`Refusing unsafe Convex command: ${unsafeReason}.`);
    console.error("Use the normal safe deploy output or the names-only environment check.");
    process.exitCode = 2;
    return;
  }

  const convexBin = fileURLToPath(new URL("../node_modules/.bin/convex", import.meta.url));
  const child = spawn(convexBin, convexArguments(mode, args), {
    cwd: path.resolve(fileURLToPath(new URL("..", import.meta.url))),
    env: process.env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(`Unable to start the safe Convex command: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

const isDirectInvocation = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectInvocation) await main();
