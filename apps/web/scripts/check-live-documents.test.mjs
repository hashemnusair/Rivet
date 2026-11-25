import test from "node:test";
import assert from "node:assert/strict";
import { documentProblem, LIVE_DOCUMENTS } from "./check-live-documents.mjs";

const page = '<!DOCTYPE html><html lang="en" dir="ltr"><head><title>RIVET</title></head><body><main>Gym team</main></body></html>';
// What Production sent for every page on 25 November 2026.
const errorDocument = '<!DOCTYPE html><html data-dpl-id="dpl_x" id="__next_error__"><head><title>Gym team sign-in · RIVET</title></head><body><div hidden=""></div><script src="/_next/static/chunks/webpack.js" async=""></script></body></html>';

test("accepts a server-rendered page", () => {
  assert.equal(documentProblem({ status: 200, body: page }), null);
});

test("rejects a server error even though the body would still load in a browser", () => {
  assert.equal(documentProblem({ status: 500, body: errorDocument }), "answered HTTP 500");
});

test("rejects Next's error document whatever its status", () => {
  assert.match(documentProblem({ status: 200, body: errorDocument }), /error document/);
});

test("rejects a missing page", () => {
  assert.equal(documentProblem({ status: 404, body: page }), "answered HTTP 404");
});

test("does not mistake page text for the error document", () => {
  assert.equal(documentProblem({ status: 200, body: page.replace("Gym team", 'the id="__next_error__" marker') }), null);
});

test("covers every host people sign in on", () => {
  for (const host of ["www.rivetjo.com", "dashboard.rivetjo.com", "app.rivetjo.com", "platform.rivetjo.com"]) {
    assert.ok(LIVE_DOCUMENTS.some((url) => new URL(url).hostname === host), host);
  }
});
