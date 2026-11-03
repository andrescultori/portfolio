/* PT/EN switch for the private pages (admin.html, pm.html).
   Each page is written in ONE source language (declared with
   data-i18n-source on <html>) and gets a dictionary from js/i18n-<page>.js
   (window.I18N_PAGE = { exact, patterns, skip }). The engine swaps visible
   text, placeholders, titles and aria-labels between the source language and
   the other one, remembers the choice in localStorage, and keeps translating
   what the page builds later (MutationObserver). Nothing is sent anywhere. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AdminI18n = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  var STORE_KEY = "portfolioAdminLang";
  var ATTRS = ["placeholder", "title", "aria-label", "alt"];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, SVG: 1 };

  /* Pure: translate one string with a page dictionary, or return null. */
  function translate(str, page) {
    if (!page || typeof str !== "string") return null;
    var m = str.match(/^(\s*)([\s\S]*?)(\s*)$/);
    var core = m[2];
    if (!core) return null;
    var exact = page.exact || {};
    if (Object.prototype.hasOwnProperty.call(exact, core)) return m[1] + exact[core] + m[3];
    var patterns = page.patterns || [];
    for (var i = 0; i < patterns.length; i++) {
      var re = new RegExp(patterns[i][0]);
      if (re.test(core)) return m[1] + core.replace(re, patterns[i][1]) + m[3];
    }
    return null;
  }

  function init() {
    var doc = root.document;
    var page = root.I18N_PAGE;
    if (!doc || !page) return;
    var source = doc.documentElement.getAttribute("data-i18n-source") || "en";
    var other = source === "en" ? "pt" : "en";
    var lang = readLang();
    var applying = false;
    var textRecs = new WeakMap(); // Text node -> { orig, tr }
    var attrRecs = new WeakMap(); // Element -> { attr: { orig, tr } }
    var skipSel = "[data-no-i18n]" + (page.skip ? "," + page.skip : "");

    function readLang() {
      try {
        var v = root.localStorage.getItem(STORE_KEY);
        if (v === "pt" || v === "en") return v;
      } catch (e) { /* storage blocked: fall through */ }
      return "pt";
    }
    function saveLang(v) {
      try { root.localStorage.setItem(STORE_KEY, v); } catch (e) { /* ignore */ }
    }
    function skipped(node) {
      var el = node.nodeType === 1 ? node : node.parentElement;
      if (!el) return true;
      if (SKIP_TAGS[el.tagName.toUpperCase()]) return true;
      return Boolean(el.closest && el.closest(skipSel));
    }

    function applyText(node) {
      if (skipped(node)) return;
      var rec = textRecs.get(node);
      if (rec && node.data !== rec.tr) rec = null; // app rewrote it: new original
      var orig = rec ? rec.orig : node.data;
      if (lang === source) {
        if (rec) { node.data = orig; textRecs.delete(node); }
        return;
      }
      var tr = translate(orig, page);
      if (tr !== null && tr !== node.data) { node.data = tr; textRecs.set(node, { orig: orig, tr: tr }); }
      else if (tr === null && rec) textRecs.delete(node);
    }

    function applyAttrs(el) {
      if (skipped(el)) return;
      var recs = attrRecs.get(el) || {};
      for (var i = 0; i < ATTRS.length; i++) {
        var a = ATTRS[i];
        if (!el.hasAttribute(a)) continue;
        var cur = el.getAttribute(a);
        var rec = recs[a];
        if (rec && cur !== rec.tr) rec = null;
        var orig = rec ? rec.orig : cur;
        if (lang === source) {
          if (rec) { el.setAttribute(a, orig); delete recs[a]; }
          continue;
        }
        var tr = translate(orig, page);
        if (tr !== null && tr !== cur) { el.setAttribute(a, tr); recs[a] = { orig: orig, tr: tr }; }
      }
      attrRecs.set(el, recs);
    }

    function walk(node) {
      if (node.nodeType === 3) return applyText(node);
      if (node.nodeType !== 1 || skipped(node)) return;
      applyAttrs(node);
      for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
    }

    var titleOrig = doc.title;
    function applyAll() {
      applying = true;
      doc.documentElement.setAttribute("lang", lang === "pt" ? "pt-BR" : "en");
      doc.title = lang === source ? titleOrig : translate(titleOrig, page) || titleOrig;
      walk(doc.body);
      applying = false;
      if (observer) observer.takeRecords();
    }

    var observer = null;
    if (root.MutationObserver) {
      observer = new root.MutationObserver(function (records) {
        if (applying) return;
        applying = true;
        records.forEach(function (r) {
          if (r.type === "characterData") applyText(r.target);
          else if (r.type === "attributes") applyAttrs(r.target);
          else r.addedNodes.forEach(walk);
        });
        applying = false;
        observer.takeRecords();
      });
    }

    /* Native dialogs are not in the DOM, so translate their message. */
    var nativeConfirm = root.confirm && root.confirm.bind(root);
    if (nativeConfirm) {
      root.confirm = function (msg) {
        var tr = lang === source ? null : translate(String(msg), page);
        return nativeConfirm(tr !== null ? tr : msg);
      };
    }

    function buildToggle() {
      var host = doc.querySelector(".nav-links");
      if (!host) return;
      var group = doc.createElement("div");
      group.className = "lang-toggle";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", "Language / Idioma");
      group.setAttribute("data-no-i18n", "");
      ["pt", "en"].forEach(function (code) {
        var b = doc.createElement("button");
        b.type = "button";
        b.textContent = code.toUpperCase();
        b.dataset.lang = code;
        b.addEventListener("click", function () { setLang(code); });
        group.appendChild(b);
      });
      host.insertBefore(group, host.firstChild);
    }
    function syncToggle() {
      doc.querySelectorAll(".lang-toggle button").forEach(function (b) {
        b.setAttribute("aria-pressed", b.dataset.lang === lang ? "true" : "false");
      });
    }
    function setLang(next) {
      if (next !== "pt" && next !== "en") return;
      lang = next;
      saveLang(next);
      applyAll();
      syncToggle();
    }

    buildToggle();
    syncToggle();
    applyAll();
    if (observer) {
      observer.observe(doc.body, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ATTRS,
      });
    }
    root.AdminI18n.setLang = setLang;
    root.AdminI18n.getLang = function () { return lang; };
    root.AdminI18n.other = other;
  }

  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", init);
    else init();
  }
  return { translate: translate, STORE_KEY: STORE_KEY };
});
