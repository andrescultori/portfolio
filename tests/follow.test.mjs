import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

/* js/follow.js is a browser classic script (no import/export), loaded into
   a minimal node:vm sandbox — same pattern as tests/motion.test.mjs and
   tests/admin-metrics.test.mjs. Only the pure translation/date/grouping
   helpers are exercised here; the DOM-rendering functions (renderPage,
   renderWaiting, etc.) touch a real document and aren't re-tested this
   way — the Playwright check covers those. */

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FOLLOW_SRC = readFileSync(path.join(TESTS_DIR, "..", "js", "follow.js"), "utf8");

function loadFollowSandbox() {
  const sandbox = {
    window: { requestAnimationFrame: () => 0, location: { search: "" } },
    document: { documentElement: {}, addEventListener: () => {} },
    URLSearchParams,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(FOLLOW_SRC, sandbox, { filename: "js/follow.js" });
  return sandbox;
}

const sandbox = loadFollowSandbox();

// --- translations (pt default, en) -------------------------------------

test("t() returns pt by default and for an unknown language", () => {
  assert.equal(sandbox.t("pt", "roadmap_title"), "Roteiro");
  assert.equal(sandbox.t("xx", "roadmap_title"), "Roteiro");
  assert.equal(sandbox.t(undefined, "roadmap_title"), "Roteiro");
});

test("t() returns en when lang is 'en'", () => {
  assert.equal(sandbox.t("en", "roadmap_title"), "Roadmap");
});

test("t() substitutes {vars} in the template", () => {
  assert.equal(sandbox.t("en", "progress_label", { done: 3, total: 5 }), "3 of 5 tasks done");
  assert.equal(sandbox.t("pt", "progress_label", { done: 3, total: 5 }), "3 de 5 tarefas concluídas");
});

test("statusLabel/milestoneStatusLabel/ownerLabel cover every value in pt and en", () => {
  ["idea", "planned", "active", "paused", "done", "archived"].forEach((status) => {
    assert.notEqual(sandbox.statusLabel("en", status), undefined);
    assert.notEqual(sandbox.statusLabel("pt", status), undefined);
  });
  assert.equal(sandbox.milestoneStatusLabel("en", "dropped"), "Dropped");
  assert.equal(sandbox.milestoneStatusLabel("pt", "dropped"), "Cancelado");
});

test("ownerLabel: client -> You/Você, me -> André in both languages", () => {
  assert.equal(sandbox.ownerLabel("en", "client"), "You");
  assert.equal(sandbox.ownerLabel("pt", "client"), "Você");
  assert.equal(sandbox.ownerLabel("en", "me"), "André");
  assert.equal(sandbox.ownerLabel("pt", "me"), "André");
});

// --- formatDate ----------------------------------------------------------

test("formatDate: dd/mm/yyyy for pt, mm/dd/yyyy for en", () => {
  assert.equal(sandbox.formatDate("2026-03-07", "pt"), "07/03/2026");
  assert.equal(sandbox.formatDate("2026-03-07", "en"), "03/07/2026");
});

test("formatDate handles a full timestamp (takes only the date part) and empty input", () => {
  assert.equal(sandbox.formatDate("2026-03-07T12:34:56.000Z", "pt"), "07/03/2026");
  assert.equal(sandbox.formatDate("", "en"), "");
  assert.equal(sandbox.formatDate(null, "en"), "");
});

// --- progressText ----------------------------------------------------------

test("progressText is null when total is 0 (hides the progress bar)", () => {
  assert.equal(sandbox.progressText("en", { done: 0, total: 0 }), null);
  assert.equal(sandbox.progressText("en", null), null);
});

test("progressText formats 'X of Y tasks done' in both languages", () => {
  assert.equal(sandbox.progressText("en", { done: 2, total: 5 }), "2 of 5 tasks done");
  assert.equal(sandbox.progressText("pt", { done: 2, total: 5 }), "2 de 5 tarefas concluídas");
});

// --- collectWaitingOnClient ------------------------------------------------

test("collectWaitingOnClient returns [] for an empty project (no milestones, no other_tasks)", () => {
  // Arrays/objects built inside the vm sandbox compare unequal to a
  // same-content literal via deepStrictEqual (different Array.prototype,
  // same precedent as tests/motion.test.mjs) — compare serialized instead.
  assert.equal(JSON.stringify(sandbox.collectWaitingOnClient({ milestones: [], other_tasks: [] })), "[]");
  assert.equal(JSON.stringify(sandbox.collectWaitingOnClient({})), "[]");
});

test("collectWaitingOnClient only includes open (not done) tasks owned by the client", () => {
  const data = {
    milestones: [
      {
        title: "M1",
        tasks: [
          { title: "A", done: false, owner: "client" },
          { title: "B", done: true, owner: "client" }, // done -> excluded
          { title: "C", done: false, owner: "me" }, // owner me -> excluded
        ],
      },
    ],
    other_tasks: [
      { title: "D", done: false, owner: "client" },
    ],
  };
  const result = sandbox.collectWaitingOnClient(data);
  assert.equal(JSON.stringify(Array.from(result, (t) => t.title).sort()), JSON.stringify(["A", "D"]));
});

test("a task from a hidden milestone (server places it in other_tasks) is still picked up", () => {
  // The server-side pm_client_view() function puts a visible task whose
  // milestone is NOT visible into other_tasks, not into any milestone's
  // own tasks array — simulate exactly that shape here.
  const data = {
    milestones: [{ title: "Visible milestone", tasks: [] }],
    other_tasks: [{ title: "Orphaned from hidden milestone", done: false, owner: "client" }],
  };
  const result = sandbox.collectWaitingOnClient(data);
  assert.equal(JSON.stringify(Array.from(result, (t) => t.title)), JSON.stringify(["Orphaned from hidden milestone"]));
});

// --- hasAnyVisibleTasks -----------------------------------------------------

test("hasAnyVisibleTasks reflects progress.total, independent of owner", () => {
  assert.equal(sandbox.hasAnyVisibleTasks({ progress: { done: 0, total: 0 } }), false);
  assert.equal(sandbox.hasAnyVisibleTasks({ progress: { done: 0, total: 3 } }), true);
  assert.equal(sandbox.hasAnyVisibleTasks({}), false);
});

// --- isOverdue ---------------------------------------------------------------

test("isOverdue compares only the date part against today, and is false for no date", () => {
  assert.equal(sandbox.isOverdue(""), false);
  assert.equal(sandbox.isOverdue(null), false);
  assert.equal(sandbox.isOverdue("2000-01-01"), true);
  assert.equal(sandbox.isOverdue("2999-01-01"), false);
});

// --- getToken ----------------------------------------------------------------

test("getToken reads 't' from window.location.search", () => {
  sandbox.window.location.search = "?t=abc123";
  assert.equal(sandbox.getToken(), "abc123");
  sandbox.window.location.search = "";
  assert.equal(sandbox.getToken(), null);
});
