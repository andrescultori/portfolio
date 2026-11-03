import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// The engine is a browser script (no module system): run it in a bare context.
const engineCtx = {};
engineCtx.globalThis = engineCtx;
vm.runInNewContext(readFileSync(new URL("../js/i18n.js", import.meta.url), "utf8"), engineCtx);
const { translate } = engineCtx.AdminI18n;

function loadPage(file) {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8"), ctx);
  return ctx.window.I18N_PAGE;
}
const pm = loadPage("i18n-pm.js");
const admin = loadPage("i18n-admin.js");

/* Visible text + placeholder/aria/title in a static HTML file. */
function staticStrings(file) {
  let html = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  html = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<!--[\s\S]*?-->/g, "");
  const out = new Set();
  const add = (t) => {
    const s = t.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (/[A-Za-zÀ-ú]{3,}/.test(s)) out.add(s);
  };
  for (const m of html.matchAll(/>([^<>]+)</g)) add(m[1]);
  for (const m of html.matchAll(/(?:placeholder|aria-label|title)="([^"]+)"/g)) add(m[1]);
  return [...out];
}

// Strings that are names, URLs, paths or identical in both languages.
const SAME = /^(André Scultori|GitHub|Site|Apps|Slug \*|Insights \((PT|EN)\)|·|© 2026|https?:\/\/.*|img\/.*|HTML, CSS, JavaScript|AS)$/;

test("every static string in pm.html (EN source) has a Portuguese translation", () => {
  const missing = staticStrings("pm.html").filter(
    (s) => !SAME.test(s) && translate(s, pm) === null && !/^(Português|English|Brand)$/.test(s)
  );
  assert.deepEqual(missing, []);
});

test("every static string in admin.html (PT source) has an English translation", () => {
  const missing = staticStrings("admin.html").filter(
    (s) => !SAME.test(s) && translate(s, admin) === null
  );
  assert.deepEqual(missing, []);
});

test("interpolated messages are translated through patterns", () => {
  assert.equal(translate("Next: MVP", pm), "Próximo: MVP");
  assert.equal(translate("3/5 tasks", pm), "3/5 tarefas");
  assert.equal(translate("Done: Write docs", pm), "Concluída: Write docs");
  assert.equal(translate("Erro ao salvar: boom", admin), "Error saving: boom");
  assert.equal(translate('Excluir o projeto "X"? Essa ação não pode ser desfeita.', admin), 'Delete the project "X"? This cannot be undone.');
});

test("whitespace around a string is preserved and unknown text is left alone", () => {
  assert.equal(translate("  Save ", pm), "  Salvar ");
  assert.equal(translate("some project name", pm), null);
});

test("both private pages load the engine, a dictionary and the toggle styles", () => {
  for (const [file, src, dict] of [["pm.html", "en", "i18n-pm.js"], ["admin.html", "pt", "i18n-admin.js"]]) {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(html.includes(`data-i18n-source="${src}"`), `${file} source language`);
    assert.ok(html.includes(`js/${dict}`) && html.includes("js/i18n.js"), `${file} scripts`);
    assert.ok(html.includes("css/lang-toggle.css"), `${file} css`);
    assert.ok(html.indexOf(dict) < html.indexOf("js/i18n.js"), `${file}: dictionary before engine`);
  }
});
