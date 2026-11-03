/* follow/index.html — public, read-only "client view" of a pm.html
   project. No login, no session, no localStorage: everything comes from
   one call to the pm_client_view(p_token) Postgres function (SECURITY
   DEFINER, callable by anon — see supabase/migrations/20261103170000_
   pm_client_view.sql). That function already filters to rows marked
   visible_to_client; this file never reads any pm_* table directly.

   Browser classic script (no import/export), same convention as
   js/admin.js, js/pm.js and (pre-redesign) js/motion.js — top-level
   `var`/`function` declarations so tests/follow.test.mjs can load this
   file with node:vm and exercise the pure helpers directly as sandbox
   globals, with no real DOM involved. Rendering uses DOM nodes +
   textContent only, never innerHTML with server/client data. */

/* -------------------------------------------------------------------------
   Strings (pt default, en) — every piece of fixed UI copy on this page.
   ------------------------------------------------------------------------- */

var FW_STRINGS = {
  pt: {
    kicker: "Acompanhamento do projeto",
    status_idea: "Ideia",
    status_planned: "Planejado",
    status_active: "Em andamento",
    status_paused: "Pausado",
    status_done: "Concluído",
    status_archived: "Arquivado",
    milestone_planned: "Planejado",
    milestone_active: "Em andamento",
    milestone_done: "Concluído",
    milestone_dropped: "Cancelado",
    owner_client: "Você",
    owner_me: "André",
    progress_label: "{done} de {total} tarefas concluídas",
    updated_label: "Atualizado em {date}",
    waiting_title: "Aguardando você",
    waiting_intro: "Estes itens estão esperando uma ação sua para o projeto avançar.",
    waiting_empty: "Nada aguardando você no momento.",
    roadmap_title: "Roteiro",
    phases_complete: "{done} de {total} fases concluídas",
    tasks_count: "{done}/{total} tarefas",
    other_tasks_title: "Outras tarefas",
    updates_title: "Atualizações",
    footer_text: "Página somente leitura. Dúvidas? ",
    invalid_link: "Este link é inválido ou não está mais ativo.",
    network_error: "Não foi possível carregar esta página agora.",
    retry: "Tentar novamente",
  },
  en: {
    kicker: "Project tracking",
    status_idea: "Idea",
    status_planned: "Planned",
    status_active: "Active",
    status_paused: "Paused",
    status_done: "Done",
    status_archived: "Archived",
    milestone_planned: "Planned",
    milestone_active: "Active",
    milestone_done: "Done",
    milestone_dropped: "Dropped",
    owner_client: "You",
    owner_me: "André",
    progress_label: "{done} of {total} tasks done",
    updated_label: "Last updated {date}",
    waiting_title: "Waiting on you",
    waiting_intro: "These items are waiting on you before the project can move forward.",
    waiting_empty: "Nothing is waiting on you right now.",
    roadmap_title: "Roadmap",
    phases_complete: "{done} of {total} phases complete",
    tasks_count: "{done}/{total} tasks",
    other_tasks_title: "Other tasks",
    updates_title: "Updates",
    footer_text: "Read-only page. Questions? ",
    invalid_link: "This link is invalid or no longer active.",
    network_error: "Could not load this page right now.",
    retry: "Retry",
  },
};

var FW_CONTACT_EMAIL = "amscultori@gmail.com"; // mirrors js/social.js's SOCIAL_LINKS.email (not overridable via site settings)

/* Normalizes an unknown/missing lang to "pt" (the project default). */
function fwLang(lang) {
  return lang === "en" ? "en" : "pt";
}

function t(lang, key, vars) {
  var table = FW_STRINGS[fwLang(lang)];
  var text = (table && table[key]) || FW_STRINGS.pt[key] || key;
  if (!vars) return text;
  return Object.keys(vars).reduce(function (acc, k) {
    return acc.split("{" + k + "}").join(String(vars[k]));
  }, text);
}

function statusLabel(lang, status) {
  return t(lang, "status_" + status) !== "status_" + status ? t(lang, "status_" + status) : status;
}

function milestoneStatusLabel(lang, status) {
  return t(lang, "milestone_" + status) !== "milestone_" + status ? t(lang, "milestone_" + status) : status;
}

function ownerLabel(lang, owner) {
  return owner === "client" ? t(lang, "owner_client") : t(lang, "owner_me");
}

/* -------------------------------------------------------------------------
   Dates
   ------------------------------------------------------------------------- */

function formatDate(iso, lang) {
  if (!iso) return "";
  var datePart = String(iso).slice(0, 10);
  var parts = datePart.split("-");
  if (parts.length !== 3) return datePart;
  var y = parts[0], m = parts[1], d = parts[2];
  // dd/mm/yyyy for pt, mm/dd/yyyy for en — plain string formatting (no
  // Intl dependency) so this is identical in Node (tests) and every browser.
  return fwLang(lang) === "en" ? m + "/" + d + "/" + y : d + "/" + m + "/" + y;
}

function isOverdue(iso) {
  if (!iso) return false;
  var today = new Date().toISOString().slice(0, 10);
  return String(iso).slice(0, 10) < today;
}

/* -------------------------------------------------------------------------
   Pure data helpers — operate on the pm_client_view() JSON response.
   ------------------------------------------------------------------------- */

function progressText(lang, progress) {
  if (!progress || !progress.total) return null;
  return t(lang, "progress_label", { done: progress.done || 0, total: progress.total });
}

/* Flattens every open (not done), owner="client" task across every visible
   milestone's tasks and other_tasks into one list — this is what "Waiting
   on you" shows. Tasks in a hidden milestone already never reach this
   client at all: the server-side function places them in other_tasks
   instead (see pm_client_view's own "milestone_id is null or ... not
   visible_to_client" clause), so this function doesn't need to re-derive
   that — it only needs to walk the two arrays as given. */
function collectWaitingOnClient(data) {
  var result = [];
  var milestones = (data && data.milestones) || [];
  milestones.forEach(function (m) {
    (m.tasks || []).forEach(function (task) {
      if (!task.done && task.owner === "client") result.push(task);
    });
  });
  ((data && data.other_tasks) || []).forEach(function (task) {
    if (!task.done && task.owner === "client") result.push(task);
  });
  return result;
}

/* Whether the project has any visible tasks at all (regardless of owner) —
   used to decide between hiding "Waiting on you" entirely (no visible
   tasks exist yet) vs. showing the quiet "nothing waiting" message
   (visible tasks exist, just none are the client's). */
function hasAnyVisibleTasks(data) {
  return Boolean(data && data.progress && data.progress.total > 0);
}

/* -------------------------------------------------------------------------
   DOM rendering (not pure — real document access from here down)
   ------------------------------------------------------------------------- */

function el(tag, attrs, children) {
  var node = document.createElement(tag);
  attrs = attrs || {};
  for (var key in attrs) {
    if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
    var value = attrs[key];
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  (children || []).forEach(function (child) {
    if (child === null || child === undefined || child === false) return;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

function taskItemEl(lang, task, showOwner) {
  var due = task.due_date
    ? el("span", { class: "fw-due" + (!task.done && isOverdue(task.due_date) ? " is-overdue" : ""), text: formatDate(task.due_date, lang) })
    : null;
  var owner = showOwner ? el("span", { class: "fw-owner-tag", text: ownerLabel(lang, task.owner) }) : null;
  return el("li", { class: "fw-task-item" + (task.done ? " is-done" : "") }, [
    el("span", { class: "fw-task-check", "aria-hidden": "true", text: task.done ? "✓" : "○" }),
    el("span", { class: "fw-task-title", text: task.title }),
    owner,
    due,
  ]);
}

function waitingItemEl(lang, task) {
  var due = task.due_date
    ? el("span", { class: "fw-due" + (isOverdue(task.due_date) ? " is-overdue" : ""), text: formatDate(task.due_date, lang) })
    : null;
  return el("li", { class: "fw-waiting-item" }, [
    el("span", { class: "fw-task-title", text: task.title }),
    due,
  ]);
}

function renderWaiting(lang, data) {
  var section = document.getElementById("fw-waiting-section");
  var waiting = collectWaitingOnClient(data);

  if (!waiting.length && !hasAnyVisibleTasks(data)) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  document.getElementById("fw-waiting-title").textContent = t(lang, "waiting_title");

  var intro = document.getElementById("fw-waiting-intro");
  var empty = document.getElementById("fw-waiting-empty");
  var list = document.getElementById("fw-waiting-list");
  list.replaceChildren();

  if (waiting.length) {
    intro.textContent = t(lang, "waiting_intro");
    intro.hidden = false;
    empty.hidden = true;
    waiting.forEach(function (task) {
      list.appendChild(waitingItemEl(lang, task));
    });
  } else {
    intro.hidden = true;
    empty.textContent = t(lang, "waiting_empty");
    empty.hidden = false;
  }
}

function fillEl(pct) {
  var node = document.createElement("span");
  node.style.width = pct + "%";
  return node;
}

/* Bar with one segment per visible phase and its task progress. */
function renderPhaseBar(lang, milestones) {
  if (!milestones.length) return null;
  var doneCount = milestones.filter(function (m) { return m.status === "done"; }).length;
  var segs = milestones.map(function (m, i) {
    var tasks = m.tasks || [];
    var done = tasks.filter(function (x) { return x.done; }).length;
    var pct = m.status === "done" ? 100 : tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    return el("div", { class: "fw-phase-seg s-" + m.status, role: "listitem" }, [
      el("div", { class: "fw-phase-seg-top" }, [
        el("strong", { text: (i + 1) + ". " + m.title }),
        el("span", { class: "fw-milestone-status" + (m.status === "active" ? " is-active" : ""), text: milestoneStatusLabel(lang, m.status) }),
      ]),
      el("div", { class: "fw-phase-track" }, [fillEl(pct)]),
      tasks.length ? el("span", { class: "fw-due", text: t(lang, "tasks_count", { done: done, total: tasks.length }) }) : null,
    ]);
  });
  return el("div", { class: "fw-phase-bar-wrap" }, [
    el("p", { class: "fw-phase-summary", text: t(lang, "phases_complete", { done: doneCount, total: milestones.length }) }),
    el("div", { class: "fw-phase-bar", role: "list" }, segs),
  ]);
}

function renderMilestone(lang, m) {
  var statusClass = "fw-milestone-status" + (m.status === "active" ? " is-active" : "");
  var head = el("div", { class: "fw-milestone-head" }, [
    el("h3", { text: m.title }),
    el("span", { class: statusClass, text: milestoneStatusLabel(lang, m.status) }),
    m.target_date ? el("span", { class: "fw-due", text: formatDate(m.target_date, lang) }) : null,
  ]);
  var desc = m.description ? el("p", { class: "fw-milestone-desc", text: m.description }) : null;
  var list = el("ul", { class: "fw-task-list" }, (m.tasks || []).map(function (task) {
    return taskItemEl(lang, task, true);
  }));
  return el("div", { class: "fw-milestone" }, [head, desc, list]);
}

function renderRoadmap(lang, data) {
  var section = document.getElementById("fw-roadmap-section");
  var milestones = (data && data.milestones) || [];
  var otherTasks = (data && data.other_tasks) || [];

  if (!milestones.length && !otherTasks.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  document.getElementById("fw-roadmap-title").textContent = t(lang, "roadmap_title");

  var phaseBar = renderPhaseBar(lang, milestones);
  document.getElementById("fw-milestones").replaceChildren(
    ...(phaseBar ? [phaseBar] : []),
    ...milestones.map(function (m) {
      return renderMilestone(lang, m);
    })
  );

  var otherBlock = document.getElementById("fw-other-tasks-block");
  if (otherTasks.length) {
    otherBlock.hidden = false;
    document.getElementById("fw-other-tasks-title").textContent = t(lang, "other_tasks_title");
    document.getElementById("fw-other-tasks").replaceChildren(
      ...otherTasks.map(function (task) {
        return taskItemEl(lang, task, true);
      })
    );
  } else {
    otherBlock.hidden = true;
  }
}

function updateItemEl(lang, note) {
  return el("li", { class: "fw-update-item" }, [
    el("time", { class: "fw-update-date", text: formatDate(note.created_at, lang) }),
    el("p", { class: "fw-update-body", text: note.body }),
  ]);
}

function renderUpdates(lang, data) {
  var section = document.getElementById("fw-updates-section");
  var updates = (data && data.updates) || [];
  if (!updates.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  document.getElementById("fw-updates-title").textContent = t(lang, "updates_title");
  document.getElementById("fw-updates-list").replaceChildren(
    ...updates.map(function (note) {
      return updateItemEl(lang, note);
    })
  );
}

function renderPage(data) {
  var lang = fwLang(data.project && data.project.lang);
  document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
  document.getElementById("fw-kicker").textContent = t(lang, "kicker");

  document.getElementById("fw-project-name").textContent = data.project.name;
  document.getElementById("fw-status").textContent = statusLabel(lang, data.project.status);

  var updatedEl = document.getElementById("fw-updated");
  if (data.updated_at) {
    updatedEl.textContent = t(lang, "updated_label", { date: formatDate(data.updated_at, lang) });
    updatedEl.hidden = false;
  } else {
    updatedEl.hidden = true;
  }

  var summaryEl = document.getElementById("fw-summary");
  if (data.project.summary) {
    summaryEl.textContent = data.project.summary;
    summaryEl.hidden = false;
  } else {
    summaryEl.hidden = true;
  }

  var progressBlock = document.getElementById("fw-progress-block");
  var progLabel = progressText(lang, data.progress);
  if (progLabel) {
    progressBlock.hidden = false;
    var pct = data.progress.total ? Math.round((data.progress.done / data.progress.total) * 100) : 0;
    var fill = document.getElementById("fw-progress-fill");
    fill.setAttribute("aria-valuenow", String(pct));
    document.getElementById("fw-progress-label").textContent = progLabel;
    // Animate on next frame so the CSS transition actually runs (see
    // css/follow.css's "Motion" note — disabled under prefers-reduced-motion
    // by the transition itself being removed there).
    window.requestAnimationFrame(function () {
      fill.style.width = pct + "%";
    });
  } else {
    progressBlock.hidden = true;
  }

  renderWaiting(lang, data);
  renderRoadmap(lang, data);
  renderUpdates(lang, data);

  var footerText = document.getElementById("fw-footer-text");
  footerText.textContent = "";
  footerText.appendChild(document.createTextNode(t(lang, "footer_text")));
  footerText.appendChild(el("a", { href: "mailto:" + FW_CONTACT_EMAIL, text: FW_CONTACT_EMAIL }));

  document.getElementById("fw-loading").hidden = true;
  document.getElementById("fw-error").hidden = true;
  document.getElementById("fw-content").hidden = false;
}

function showInvalidLink(lang) {
  document.getElementById("fw-loading").hidden = true;
  document.getElementById("fw-content").hidden = true;
  var box = document.getElementById("fw-error");
  box.hidden = false;
  document.getElementById("fw-error-message").textContent = t(lang, "invalid_link");
  document.getElementById("fw-retry").hidden = true;
}

function showNetworkError(lang, onRetry) {
  document.getElementById("fw-loading").hidden = true;
  document.getElementById("fw-content").hidden = true;
  var box = document.getElementById("fw-error");
  box.hidden = false;
  document.getElementById("fw-error-message").textContent = t(lang, "network_error");
  var retry = document.getElementById("fw-retry");
  retry.textContent = t(lang, "retry");
  retry.hidden = false;
  retry.onclick = onRetry;
}

/* -------------------------------------------------------------------------
   Fetch + init
   ------------------------------------------------------------------------- */

function getToken() {
  return new URLSearchParams(window.location.search).get("t");
}

async function loadAndRender(sb) {
  var token = getToken();
  if (!token) {
    showInvalidLink("pt");
    return;
  }
  var loading = document.getElementById("fw-loading");
  var errorBox = document.getElementById("fw-error");
  loading.hidden = false;
  errorBox.hidden = true;

  var response;
  try {
    response = await sb.rpc("pm_client_view", { p_token: token });
  } catch (err) {
    showNetworkError("pt", function () {
      loadAndRender(sb);
    });
    return;
  }

  if (response.error) {
    showNetworkError("pt", function () {
      loadAndRender(sb);
    });
    return;
  }
  if (!response.data) {
    showInvalidLink("pt");
    return;
  }
  renderPage(response.data);
}

function init() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    showNetworkError("pt", function () {
      window.location.reload();
    });
    return;
  }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  loadAndRender(sb);

  // Re-fetch when the tab regains focus, so a long-open tab stays current.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") loadAndRender(sb);
  });
}

document.addEventListener("DOMContentLoaded", init);
