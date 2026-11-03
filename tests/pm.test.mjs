import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

/* js/pm.js is a browser classic script, loaded into a minimal node:vm
   sandbox — same pattern as tests/admin-metrics.test.mjs. Only the pure
   helpers (buildShareLink, clientViewSummary) are exercised here; the
   DOM-rendering functions touch a real document and Supabase client and
   aren't re-tested this way. */

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PM_SRC = readFileSync(path.join(TESTS_DIR, "..", "js", "pm.js"), "utf8");

function makeFakeElement() {
  return {
    style: {},
    classList: { add: () => {}, toggle: () => {}, contains: () => false },
    setAttribute: () => {},
    getAttribute: () => null,
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
}

function loadPmSandbox() {
  const elementsById = new Map();
  const fakeDocument = {
    documentElement: makeFakeElement(),
    createElement: () => makeFakeElement(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: (id) => {
      if (!elementsById.has(id)) elementsById.set(id, makeFakeElement());
      return elementsById.get(id);
    },
    addEventListener: () => {},
  };
  const sandbox = {
    document: fakeDocument,
    window: { addEventListener: () => {}, location: { hash: "" } },
    SUPABASE_URL: "https://fake.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "fake-key",
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(PM_SRC, sandbox, { filename: "js/pm.js" });
  return sandbox;
}

const sandbox = loadPmSandbox();

// --- buildShareLink ----------------------------------------------------

test("buildShareLink builds origin + base path + follow/?t=<token>, stripping pm.html", () => {
  assert.equal(
    sandbox.buildShareLink("https://andrescultori.pages.dev", "/pm.html", "abc123"),
    "https://andrescultori.pages.dev/follow/?t=abc123"
  );
});

test("buildShareLink works under any base path, not just the site root", () => {
  assert.equal(
    sandbox.buildShareLink("https://preview.pages.dev", "/preview-xyz/pm.html", "tok"),
    "https://preview.pages.dev/preview-xyz/follow/?t=tok"
  );
});

test("buildShareLink works on localhost", () => {
  assert.equal(
    sandbox.buildShareLink("http://localhost:8788", "/pm.html", "localtoken"),
    "http://localhost:8788/follow/?t=localtoken"
  );
});

// --- clientViewSummary ---------------------------------------------------

test("clientViewSummary reports N tasks, M milestones, K updates visible", () => {
  assert.equal(sandbox.clientViewSummary(0, 0, 0), "0 tasks, 0 milestones, 0 updates visible");
  assert.equal(sandbox.clientViewSummary(3, 1, 2), "3 tasks, 1 milestones, 2 updates visible");
});

// Note: NOTE_KINDS/CLIENT_LANGS are declared with `const` at module scope,
// which node:vm never exposes as sandbox globals (unlike `var`/function
// declarations — see tests/admin-metrics.test.mjs's own note on this), so
// they aren't asserted on directly here. Their effect is covered by
// js/pm.js's own `options(NOTE_KINDS, "log", NOTE_KIND_LABELS)` /
// `options(CLIENT_LANGS, p.client_lang, CLIENT_LANG_LABELS)` call sites,
// which only matter once rendered — out of scope for this pure-function
// test file.

test("buildShareLink handles the clean URL /pm that Cloudflare Pages serves", () => {
  assert.equal(
    sandbox.buildShareLink("https://andrescultori.pages.dev", "/pm", "tok"),
    "https://andrescultori.pages.dev/follow/?t=tok"
  );
  assert.equal(
    sandbox.buildShareLink("https://andrescultori.pages.dev", "/pm/", "tok"),
    "https://andrescultori.pages.dev/follow/?t=tok"
  );
  assert.equal(
    sandbox.buildShareLink("https://x.pages.dev", "/preview/pm", "tok"),
    "https://x.pages.dev/preview/follow/?t=tok"
  );
});
