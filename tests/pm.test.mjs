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

test("clientViewSummary reports visible/total for tasks, phases and updates", () => {
  const sum = (v, t) => sandbox.clientViewSummary(v, t);
  assert.equal(sum({ tasks: 0, phases: 0, updates: 0 }, { tasks: 0, phases: 0, updates: 0 }),
    "Visible to client: 0/0 tasks, 0/0 phases, 0/0 updates");
  assert.equal(sum({ tasks: 10, phases: 0, updates: 0 }, { tasks: 14, phases: 3, updates: 1 }),
    "Visible to client: 10/14 tasks, 0/3 phases, 0/1 updates");
});

// Note: NOTE_KINDS/CLIENT_LANGS are declared with `const` at module scope,
// which node:vm never exposes as sandbox globals (unlike `var`/function
// declarations — see tests/admin-metrics.test.mjs's own note on this), so
// they aren't asserted on directly here. Their effect is covered by
// js/pm.js's own `options(NOTE_KINDS, "log", NOTE_KIND_LABELS)` /
// `options(CLIENT_LANGS, p.client_lang, CLIENT_LANG_LABELS)` call sites,
// which only matter once rendered — out of scope for this pure-function
// test file.

test("pm.js keeps the scroll position on re-render and only resets it when the view changes", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../js/pm.js", import.meta.url), "utf8");
  assert.ok(src.includes("function keepScroll("), "keepScroll helper");
  assert.ok(!/route\(\)\s*\{[\s\S]*?window\.scrollTo\(0, 0\);\s*\}/.test(src), "route() must not always scroll to top");
  assert.ok(src.includes("changedView"), "scroll reset is tied to a real view change");
});

test("parseGithubRepo accepts normal, .git and deep links and rejects other hosts", () => {
  assert.deepEqual({ ...sandbox.parseGithubRepo("https://github.com/andrescultori/portfolio") }, { owner: "andrescultori", repo: "portfolio" });
  assert.deepEqual({ ...sandbox.parseGithubRepo("https://github.com/a/b.git") }, { owner: "a", repo: "b" });
  assert.deepEqual({ ...sandbox.parseGithubRepo("https://github.com/a/b/tree/main/src") }, { owner: "a", repo: "b" });
  assert.equal(sandbox.parseGithubRepo("https://gitlab.com/a/b"), null);
  assert.equal(sandbox.parseGithubRepo(""), null);
});

test("stackFromRepoData combines languages, npm/python deps and root files", () => {
  const out = sandbox.stackFromRepoData({
    languages: { JavaScript: 6000, HTML: 3000, CSS: 900, Shell: 50, PLpgSQL: 40 },
    rootNames: ["wrangler.toml", "supabase", "README.md"],
    packageJson: { dependencies: { "@supabase/supabase-js": "^2" }, devDependencies: { vite: "^5", tailwindcss: "^3" } },
    requirements: "pandas==2.0\nplotly\n# comment\n",
  });
  assert.deepEqual(Array.from(out), ["JavaScript", "HTML", "CSS", "Supabase", "Vite", "Tailwind CSS", "pandas", "Plotly", "Cloudflare"]);
});

test("mergeStack keeps existing entries in order and only appends new ones (case-insensitive)", () => {
  assert.deepEqual(Array.from(sandbox.mergeStack(["Make.com", " HTML "], ["html", "Supabase", "Make.com"])), ["Make.com", "HTML", "Supabase"]);
});

test("buildShareLink handles the clean URL /pm that Cloudflare Pages serves", () => {
  for (const pathname of ["/pm", "/pm/"]) {
    assert.equal(
      sandbox.buildShareLink("https://andrescultori.pages.dev", pathname, "tok"),
      "https://andrescultori.pages.dev/follow/?t=tok"
    );
  }
  assert.equal(sandbox.buildShareLink("https://x.pages.dev", "/preview/pm", "tok"), "https://x.pages.dev/preview/follow/?t=tok");
});

test("orderedTasks: date mode puts oldest due date first and undated last; manual mode uses sort_order", () => {
  const tasks = [
    { id: "a", due_date: null, sort_order: 0, created_at: "1" },
    { id: "b", due_date: "2026-12-10", sort_order: 1, created_at: "2" },
    { id: "c", due_date: "2026-11-05", sort_order: 2, created_at: "3" },
    { id: "d", due_date: "2026-11-05", sort_order: 1, created_at: "4" },
  ];
  assert.deepEqual(Array.from(sandbox.orderedTasks(tasks, "date")).map((t) => t.id), ["d", "c", "b", "a"]);
  assert.deepEqual(Array.from(sandbox.orderedTasks(tasks, "manual")).map((t) => t.id), ["a", "b", "d", "c"]);
});

test("moveInList swaps with the neighbour and stops at the edges; moveToPosition inserts at an index", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const ids = (l) => Array.from(l).map((x) => x.id).join("");
  assert.equal(ids(sandbox.moveInList(list, "b", -1)), "bac");
  assert.equal(ids(sandbox.moveInList(list, "b", 1)), "acb");
  assert.equal(ids(sandbox.moveInList(list, "a", -1)), "abc");
  assert.equal(ids(sandbox.moveInList(list, "c", 1)), "abc");
  assert.equal(ids(sandbox.moveToPosition(list, "c", 0)), "cab");
  assert.equal(ids(sandbox.moveToPosition(list, "a", 2)), "bca");
});

test("phaseStats counts done tasks and rounds the percentage", () => {
  assert.deepEqual({ ...sandbox.phaseStats([{ done: true }, { done: false }, { done: false }]) }, { done: 1, total: 3, pct: 33 });
  assert.deepEqual({ ...sandbox.phaseStats([]) }, { done: 0, total: 0, pct: 0 });
});
