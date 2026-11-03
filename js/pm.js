/* Personal project manager (pm.html).
   Data lives in the shared Supabase project, tables prefixed "pm_"
   (pm_clients, pm_projects, pm_milestones, pm_tasks, pm_notes). Every
   table is admin-only under RLS (is_portfolio_admin()), so nothing here is
   readable without the same GitHub login the portfolio admin uses.
   UI is built with DOM nodes + textContent only (no innerHTML with data). */

const PM_STATUSES = ["idea", "planned", "active", "paused", "done", "archived"];
const MILESTONE_STATUSES = ["planned", "active", "done", "dropped"];
const NOTE_KINDS = ["info", "decision", "log", "update"];
const NOTE_KIND_LABELS = { update: "Client update" };
const LINK_KEYS = ["repo", "live", "admin", "claude_project", "supabase", "docs", "drive"];
const CLIENT_LANGS = ["pt", "en"];
const CLIENT_LANG_LABELS = { pt: "Português", en: "English" };
const OWNER_FILTERS = [
  ["all", "All"],
  ["client", "Clients"],
  ["personal", "Personal"],
];
const STATUS_FILTERS = [
  ["open", "Open"],
  ["active", "Active"],
  ["planned", "Planned"],
  ["idea", "Ideas"],
  ["paused", "Paused"],
  ["closed", "Done/archived"],
];

let sb = null;
let authorizedUserId = null;

const state = {
  clients: [],
  projects: [],
  milestones: [],
  tasks: [],
  notes: [],
  filter: { owner: "all", status: "open", q: "" },
};

/* ---------- tiny DOM helper ---------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function options(values, selected, labels = {}) {
  return values.map((v) => el("option", { value: v, selected: v === selected, text: labels[v] || v }));
}

function toast(message, kind = "ok") {
  const box = document.getElementById("pm-toast");
  box.textContent = message;
  box.className = `pm-toast ${kind}`;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, kind === "err" ? 6000 : 2200);
}

/* Runs a Supabase call; shows an error toast and returns null on failure. */
async function run(promise, okMessage) {
  const { data, error } = await promise;
  if (error) {
    toast(error.message, "err");
    return null;
  }
  if (okMessage) toast(okMessage);
  return data ?? true;
}

function slugify(text) {
  return text
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60) || `project-${Date.now()}`;
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function isOverdue(iso) {
  return Boolean(iso) && iso.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

/* Builds the client-facing share link from window.location, so it works
   on any host (localhost, a Cloudflare Pages preview URL, production) and
   under any base path pm.html happens to be served at. Pure — takes
   origin/pathname as plain strings so it's testable without a real
   window. */
function buildShareLink(origin, pathname, token) {
  const basePath = pathname.replace(/pm\.html$/, "");
  return `${origin}${basePath}follow/?t=${token}`;
}

/* The Client view panel's "nothing exposed by accident" summary line. */
function clientViewSummary(tasksVisible, milestonesVisible, updatesVisible) {
  return `${tasksVisible} tasks, ${milestonesVisible} milestones, ${updatesVisible} updates visible`;
}

/* navigator.clipboard with a document.execCommand fallback for browsers/
   contexts where the async Clipboard API isn't available (e.g. non-HTTPS,
   older WebViews). Returns whether the copy actually succeeded. */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // fall through to the execCommand fallback below
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

/* ---------- data ---------- */

async function loadAll() {
  const [clients, projects, milestones, tasks, notes] = await Promise.all([
    sb.from("pm_clients").select("*").order("name"),
    sb.from("pm_projects").select("*").order("priority").order("name"),
    sb.from("pm_milestones").select("*").order("sort_order").order("created_at"),
    sb.from("pm_tasks").select("*").order("sort_order").order("created_at"),
    sb.from("pm_notes").select("*").order("created_at", { ascending: false }),
  ]);
  const failed = [clients, projects, milestones, tasks, notes].find((r) => r.error);
  if (failed) {
    toast(`Could not load data: ${failed.error.message}`, "err");
    return;
  }
  state.clients = clients.data;
  state.projects = projects.data;
  state.milestones = milestones.data;
  state.tasks = tasks.data;
  state.notes = notes.data;
  route();
}

const clientName = (id) => state.clients.find((c) => c.id === id)?.name || "";
const projectTasks = (id) => state.tasks.filter((t) => t.project_id === id);
const projectMilestones = (id) => state.milestones.filter((m) => m.project_id === id);
const projectNotes = (id) =>
  state.notes.filter((n) => n.project_id === id).sort((a, b) => Number(b.pinned) - Number(a.pinned));

function progress(projectId) {
  const tasks = projectTasks(projectId);
  const done = tasks.filter((t) => t.done).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

function nextMilestone(projectId) {
  return projectMilestones(projectId).find((m) => m.status === "planned" || m.status === "active");
}

/* ---------- routing (#p/<slug> = detail) ---------- */

function route() {
  const match = window.location.hash.match(/^#p\/(.+)$/);
  const project = match && state.projects.find((p) => p.slug === decodeURIComponent(match[1]));
  document.getElementById("pm-list-view").hidden = Boolean(project);
  document.getElementById("pm-detail-view").hidden = !project;
  if (project) renderDetail(project);
  else renderList();
  window.scrollTo(0, 0);
}

/* ---------- list view ---------- */

function matchesFilter(p) {
  const { owner, status, q } = state.filter;
  if (owner !== "all" && p.ownership !== owner) return false;
  if (status === "open" && ["done", "archived"].includes(p.status)) return false;
  if (status === "closed" && !["done", "archived"].includes(p.status)) return false;
  if (!["open", "closed"].includes(status) && p.status !== status) return false;
  if (q) {
    const hay = `${p.name} ${clientName(p.client_id)} ${p.summary || ""}`.toLowerCase();
    if (!hay.includes(q.toLowerCase())) return false;
  }
  return true;
}

function renderChips(containerId, items, key) {
  const box = document.getElementById(containerId);
  box.replaceChildren(
    ...items.map(([value, label]) =>
      el("button", {
        type: "button",
        class: `pm-chip${state.filter[key] === value ? " is-on" : ""}`,
        text: label,
        onclick: () => {
          state.filter[key] = value;
          renderList();
        },
      })
    )
  );
}

function renderStats() {
  const open = state.projects.filter((p) => !["done", "archived"].includes(p.status));
  const openTasks = state.tasks.filter((t) => !t.done);
  const overdue = openTasks.filter((t) => isOverdue(t.due_date)).length
    + open.filter((p) => isOverdue(p.due_date)).length;
  const stat = (value, label, warn) =>
    el("div", { class: `pm-stat${warn ? " is-warn" : ""}` }, el("strong", { text: value }), el("span", { text: label }));
  document.getElementById("pm-stats").replaceChildren(
    stat(open.filter((p) => p.status === "active").length, "active"),
    stat(open.filter((p) => p.ownership === "client").length, "open client projects"),
    stat(openTasks.length, "open tasks"),
    stat(overdue, "overdue", overdue > 0)
  );
}

function projectCard(p) {
  const prog = progress(p.id);
  const next = nextMilestone(p.id);
  return el(
    "a",
    { class: "pm-card", href: `#p/${encodeURIComponent(p.slug)}` },
    el(
      "div",
      { class: "pm-card-head" },
      el("span", { class: `pm-badge s-${p.status}`, text: p.status }),
      el("span", { class: "pm-prio", title: "Priority (1 = highest)", text: `P${p.priority}` })
    ),
    el("h3", { text: p.name }),
    el("p", { class: "pm-card-client", text: clientName(p.client_id) || "Personal" }),
    next ? el("p", { class: "pm-card-next", text: `Next: ${next.title}` }) : null,
    el(
      "div",
      { class: "pm-progress", title: `${prog.done}/${prog.total} tasks` },
      el("div", { class: "pm-progress-bar", style: `width:${prog.pct}%` })
    ),
    el(
      "div",
      { class: "pm-card-foot" },
      el("span", { text: prog.total ? `${prog.done}/${prog.total} tasks` : "No tasks yet" }),
      p.due_date
        ? el("span", { class: isOverdue(p.due_date) && p.status !== "done" ? "is-overdue" : "", text: `Due ${formatDate(p.due_date)}` })
        : null
    )
  );
}

function renderList() {
  renderStats();
  renderChips("pm-owner-chips", OWNER_FILTERS, "owner");
  renderChips("pm-status-chips", STATUS_FILTERS, "status");

  const visible = state.projects.filter(matchesFilter);
  const list = document.getElementById("pm-list");
  if (!visible.length) {
    list.replaceChildren(el("p", { class: "pm-empty", text: "No projects match these filters." }));
    return;
  }

  // Group by client (personal projects last)
  const groups = new Map();
  for (const p of visible) {
    const key = p.client_id ? clientName(p.client_id) : "Personal";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const keys = [...groups.keys()].sort((a, b) =>
    a === "Personal" ? 1 : b === "Personal" ? -1 : a.localeCompare(b)
  );
  list.replaceChildren(
    ...keys.map((key) =>
      el(
        "section",
        { class: "pm-group" },
        el("h2", { class: "pm-group-title" }, key, el("span", { text: ` ${groups.get(key).length}` })),
        el("div", { class: "pm-grid" }, groups.get(key).map(projectCard))
      )
    )
  );
}

/* ---------- new project ---------- */

function clientSelectOptions(selectedId) {
  return [
    el("option", { value: "", text: "— Personal (no client) —", selected: !selectedId }),
    ...state.clients.map((c) => el("option", { value: c.id, text: c.name, selected: c.id === selectedId })),
    el("option", { value: "__new", text: "+ New client…" }),
  ];
}

/* Resolves the "+ New client…" choice into a real client id. */
async function resolveClientId(value) {
  if (value !== "__new") return value || null;
  const name = window.prompt("New client name:");
  if (!name || !name.trim()) return undefined;
  const created = await run(sb.from("pm_clients").insert({ name: name.trim() }).select().single());
  if (!created) return undefined;
  state.clients.push(created);
  state.clients.sort((a, b) => a.name.localeCompare(b.name));
  return created.id;
}

function openNewForm() {
  const form = document.getElementById("pm-new-form");
  document.getElementById("pm-new-client").replaceChildren(...clientSelectOptions(null));
  document.getElementById("pm-new-status").replaceChildren(...options(PM_STATUSES, "planned"));
  form.reset();
  form.hidden = false;
  form.querySelector("input[name=name]").focus();
}

async function handleNewProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name")).trim();
  if (!name) return;
  const clientId = await resolveClientId(String(data.get("client_id")));
  if (clientId === undefined) return;

  let slug = slugify(name);
  if (state.projects.some((p) => p.slug === slug)) slug = `${slug}-${Date.now().toString(36)}`;

  const created = await run(
    sb.from("pm_projects").insert({
      name,
      slug,
      client_id: clientId,
      ownership: clientId ? "client" : "personal",
      status: String(data.get("status")),
    }).select().single(),
    "Project created"
  );
  if (!created) return;
  state.projects.push(created);
  form.hidden = true;
  window.location.hash = `#p/${encodeURIComponent(created.slug)}`;
}

/* ---------- detail view ---------- */

function field(label, input) {
  return el("label", { class: "pm-field" }, el("span", { text: label }), input);
}

function renderDetail(p) {
  const view = document.getElementById("pm-detail-view");
  const prog = progress(p.id);

  const header = el(
    "div",
    { class: "pm-detail-head" },
    el("a", { href: "#", class: "pm-back", text: "← All projects" }),
    el("h1", { class: "pm-title", text: p.name }),
    el(
      "p",
      { class: "pm-sub" },
      el("span", { class: `pm-badge s-${p.status}`, text: p.status }),
      ` ${clientName(p.client_id) || "Personal"} · ${prog.done}/${prog.total} tasks done`
    )
  );

  view.replaceChildren(
    header,
    renderClientViewPanel(p),
    renderRoadmapPanel(p),
    renderNotesPanel(p),
    renderInfoPanel(p),
    renderDangerPanel(p)
  );
}

/* ---------- client view (/follow/?t=<share_token>) ---------- */

function renderClientViewPanel(p) {
  const tasksVisible = projectTasks(p.id).filter((t) => t.visible_to_client).length;
  const milestonesVisible = projectMilestones(p.id).filter((m) => m.visible_to_client).length;
  const updatesVisible = projectNotes(p.id).filter((n) => n.visible_to_client).length;

  const enableToggle = el("input", {
    type: "checkbox",
    id: "cv-enable",
    checked: p.client_view_enabled,
    onchange: async (event) => {
      const updated = await run(
        sb.from("pm_projects").update({ client_view_enabled: event.target.checked }).eq("id", p.id).select().single(),
        event.target.checked ? "Client view enabled" : "Client view disabled"
      );
      if (!updated) {
        event.target.checked = !event.target.checked;
        return;
      }
      Object.assign(p, updated);
      renderDetail(p);
    },
  });

  const langSelect = el(
    "select",
    {
      id: "cv-lang",
      "aria-label": "Client view language",
      onchange: async (event) => {
        const updated = await run(
          sb.from("pm_projects").update({ client_lang: event.target.value }).eq("id", p.id).select().single()
        );
        if (updated) Object.assign(p, updated);
      },
    },
    options(CLIENT_LANGS, p.client_lang, CLIENT_LANG_LABELS)
  );

  const children = [
    el("h2", { text: "Client view" }),
    el(
      "div",
      { class: "pm-form-grid" },
      el("label", { class: "pm-field pm-inline-field" }, enableToggle, el("span", { text: "Enable" })),
      el("label", { class: "pm-field pm-inline-field" }, el("span", { text: "Language" }), langSelect)
    ),
  ];

  if (p.client_view_enabled && p.share_token) {
    const link = buildShareLink(window.location.origin, window.location.pathname, p.share_token);
    const linkInput = el("input", {
      type: "text",
      readOnly: true,
      value: link,
      "aria-label": "Client view link",
      onclick: (event) => event.target.select(),
    });
    const copyBtn = el("button", {
      type: "button",
      class: "btn btn-ghost-light btn-sm",
      text: "Copy",
      onclick: async () => {
        const ok = await copyToClipboard(link);
        toast(ok ? "Link copied" : "Could not copy automatically — select the text and copy it", ok ? "ok" : "err");
      },
    });
    const openBtn = el("a", {
      href: link,
      target: "_blank",
      rel: "noopener",
      class: "btn btn-ghost-light btn-sm",
      text: "Open preview",
    });
    const rotateBtn = el("button", {
      type: "button",
      class: "btn btn-ghost-light btn-sm",
      text: "Rotate link",
      onclick: async () => {
        if (!window.confirm("Rotate the link? The current link will stop working immediately.")) return;
        const updated = await run(
          sb.from("pm_projects").update({ share_token: null }).eq("id", p.id).select().single(),
          "Link rotated"
        );
        if (!updated) return;
        Object.assign(p, updated);
        renderDetail(p);
      },
    });
    children.push(
      el("div", { class: "pm-share-row" }, linkInput, copyBtn, openBtn, rotateBtn),
      el("p", {
        class: "pm-muted",
        text: "Anyone with the link can view the items marked visible. Nothing is visible by default.",
      })
    );
  }

  children.push(
    el("p", { class: "pm-muted", text: clientViewSummary(tasksVisible, milestonesVisible, updatesVisible) })
  );

  return el("section", { class: "pm-panel" }, children);
}

function renderInfoPanel(p) {
  const links = p.links || {};
  const form = el(
    "form",
    { class: "pm-panel" },
    el("h2", { text: "Key info" }),
    el(
      "div",
      { class: "pm-form-grid" },
      field("Name", el("input", { type: "text", name: "name", value: p.name, required: true })),
      field("Client", el("select", { name: "client_id" }, clientSelectOptions(p.client_id))),
      field("Status", el("select", { name: "status" }, options(PM_STATUSES, p.status))),
      field("Priority", el("select", { name: "priority" }, options(["1", "2", "3", "4", "5"], String(p.priority), {
        1: "1 — highest", 5: "5 — lowest",
      }))),
      field("Start", el("input", { type: "date", name: "start_date", value: p.start_date || "" })),
      field("Due", el("input", { type: "date", name: "due_date", value: p.due_date || "" }))
    ),
    field("Summary", el("textarea", { name: "summary", rows: 3, value: p.summary || "" })),
    field("Stack (comma-separated)", el("input", { type: "text", name: "stack", value: (p.stack || []).join(", ") })),
    el(
      "details",
      { class: "pm-links-edit" },
      el("summary", { text: "Edit links" }),
      el(
        "div",
        { class: "pm-form-grid" },
        LINK_KEYS.map((key) =>
          field(key.replace("_", " "), el("input", { type: "url", name: `link_${key}`, value: links[key] || "", placeholder: "https://" }))
        )
      )
    ),
    el(
      "div",
      { class: "pm-link-row" },
      LINK_KEYS.filter((k) => links[k]).map((k) =>
        el("a", { href: links[k], target: "_blank", rel: "noopener", class: "pm-chip", text: `${k.replace("_", " ")} ↗` })
      ),
      p.portfolio_slug
        ? el("a", { href: `projeto/${p.portfolio_slug}/`, target: "_blank", class: "pm-chip", text: "portfolio page ↗" })
        : null
    ),
    el("div", { class: "pm-actions" }, el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Save" }))
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const clientId = await resolveClientId(String(data.get("client_id")));
    if (clientId === undefined) return;

    const newLinks = {};
    for (const key of LINK_KEYS) {
      const value = String(data.get(`link_${key}`) || "").trim();
      if (value) newLinks[key] = value;
    }
    const patch = {
      name: String(data.get("name")).trim(),
      client_id: clientId,
      ownership: clientId ? "client" : "personal",
      status: String(data.get("status")),
      priority: Number(data.get("priority")),
      start_date: data.get("start_date") || null,
      due_date: data.get("due_date") || null,
      summary: String(data.get("summary")).trim() || null,
      stack: String(data.get("stack")).split(",").map((s) => s.trim()).filter(Boolean),
      links: newLinks,
    };
    const updated = await run(sb.from("pm_projects").update(patch).eq("id", p.id).select().single(), "Saved");
    if (!updated) return;
    Object.assign(p, updated);
    renderDetail(p);
  });

  return form;
}

/* Eye-icon toggle for visible_to_client — used on task/milestone/note
   rows alike. Accessible via aria-pressed + a descriptive aria-label
   (the glyph alone never carries the state). */
function visibleToggleButton(isVisible, label, onToggle) {
  return el(
    "button",
    {
      type: "button",
      class: `pm-visible-toggle${isVisible ? " is-on" : ""}`,
      "aria-pressed": isVisible ? "true" : "false",
      "aria-label": `${label}: ${isVisible ? "visible to client" : "hidden from client"}`,
      title: isVisible ? "Visible to client — click to hide" : "Hidden from client — click to show",
      onclick: onToggle,
    },
    el("span", { "aria-hidden": "true", text: isVisible ? "👁" : "–" })
  );
}

/* "Client" chip shown on a row currently visible, so André can scan what
   the client sees at a glance without opening /follow/ himself. */
function clientChip(isVisible) {
  return isVisible ? el("span", { class: "pm-badge pm-badge-client", text: "Client" }) : null;
}

function ownerToggleButton(task) {
  const isClient = task.owner === "client";
  return el("button", {
    type: "button",
    class: `pm-chip pm-owner-chip${isClient ? " is-client" : ""}`,
    "aria-label": `Owner: ${isClient ? "Client" : "Me"} — click to toggle`,
    text: isClient ? "Client" : "Me",
    onclick: async () => {
      const updated = await run(
        sb.from("pm_tasks").update({ owner: isClient ? "me" : "client" }).eq("id", task.id).select().single()
      );
      if (updated) Object.assign(task, updated);
      route();
    },
  });
}

function taskRow(task) {
  const checkbox = el("input", {
    type: "checkbox",
    checked: task.done,
    "aria-label": `Done: ${task.title}`,
    onchange: async (event) => {
      const updated = await run(
        sb.from("pm_tasks").update({ done: event.target.checked }).eq("id", task.id).select().single()
      );
      if (!updated) {
        event.target.checked = !event.target.checked;
        return;
      }
      Object.assign(task, updated);
      route();
    },
  });
  return el(
    "li",
    { class: `pm-task${task.done ? " is-done" : ""}` },
    checkbox,
    el("span", { class: "pm-task-title", text: task.title }),
    task.due_date
      ? el("span", { class: `pm-task-due${!task.done && isOverdue(task.due_date) ? " is-overdue" : ""}`, text: formatDate(task.due_date) })
      : null,
    clientChip(task.visible_to_client),
    ownerToggleButton(task),
    visibleToggleButton(task.visible_to_client, `task "${task.title}"`, async () => {
      const updated = await run(
        sb.from("pm_tasks").update({ visible_to_client: !task.visible_to_client }).eq("id", task.id).select().single()
      );
      if (updated) Object.assign(task, updated);
      route();
    }),
    el("button", {
      type: "button",
      class: "pm-icon-btn",
      title: "Delete task",
      text: "×",
      onclick: async () => {
        if (!(await run(sb.from("pm_tasks").delete().eq("id", task.id)))) return;
        state.tasks = state.tasks.filter((t) => t.id !== task.id);
        route();
      },
    })
  );
}

function addTaskForm(projectId, milestoneId) {
  const input = el("input", { type: "text", placeholder: "Add a task…", required: true });
  const due = el("input", { type: "date", "aria-label": "Due date" });
  return el(
    "form",
    {
      class: "pm-inline-form",
      onsubmit: async (event) => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) return;
        const siblings = state.tasks.filter((t) => t.project_id === projectId && t.milestone_id === milestoneId);
        const created = await run(
          sb.from("pm_tasks").insert({
            project_id: projectId,
            milestone_id: milestoneId,
            title,
            due_date: due.value || null,
            sort_order: siblings.length,
          }).select().single()
        );
        if (!created) return;
        state.tasks.push(created);
        route();
      },
    },
    input,
    due,
    el("button", { type: "submit", class: "btn btn-ghost-light btn-sm", text: "Add" })
  );
}

function renderRoadmapPanel(p) {
  const milestones = projectMilestones(p.id);
  const tasks = projectTasks(p.id);

  const milestoneBlocks = milestones.map((m) => {
    const mTasks = tasks.filter((t) => t.milestone_id === m.id);
    const statusSelect = el("select", {
      class: `pm-badge-select s-${m.status}`,
      "aria-label": "Milestone status",
      onchange: async (event) => {
        const updated = await run(
          sb.from("pm_milestones").update({ status: event.target.value }).eq("id", m.id).select().single()
        );
        if (updated) Object.assign(m, updated);
        route();
      },
    }, options(MILESTONE_STATUSES, m.status));

    return el(
      "div",
      { class: `pm-milestone s-${m.status}` },
      el(
        "div",
        { class: "pm-milestone-head" },
        el("h3", { text: m.title }),
        statusSelect,
        m.target_date ? el("span", { class: "pm-task-due", text: formatDate(m.target_date) }) : null,
        clientChip(m.visible_to_client),
        visibleToggleButton(m.visible_to_client, `milestone "${m.title}"`, async () => {
          const updated = await run(
            sb.from("pm_milestones").update({ visible_to_client: !m.visible_to_client }).eq("id", m.id).select().single()
          );
          if (updated) Object.assign(m, updated);
          route();
        }),
        el("button", {
          type: "button",
          class: "pm-icon-btn",
          title: "Delete milestone (tasks are kept, ungrouped)",
          text: "×",
          onclick: async () => {
            if (!window.confirm(`Delete milestone "${m.title}"? Its tasks are kept.`)) return;
            if (!(await run(sb.from("pm_milestones").delete().eq("id", m.id)))) return;
            state.milestones = state.milestones.filter((x) => x.id !== m.id);
            state.tasks.forEach((t) => { if (t.milestone_id === m.id) t.milestone_id = null; });
            route();
          },
        })
      ),
      m.description ? el("p", { class: "pm-muted", text: m.description }) : null,
      el("ul", { class: "pm-tasks" }, mTasks.map(taskRow)),
      addTaskForm(p.id, m.id)
    );
  });

  const loose = tasks.filter((t) => !t.milestone_id);
  const looseBlock = el(
    "div",
    { class: "pm-milestone is-loose" },
    el("div", { class: "pm-milestone-head" }, el("h3", { text: milestones.length ? "Other tasks" : "Checklist" })),
    el("ul", { class: "pm-tasks" }, loose.map(taskRow)),
    addTaskForm(p.id, null)
  );

  const title = el("input", { type: "text", placeholder: "New milestone…", required: true });
  const target = el("input", { type: "date", "aria-label": "Target date" });
  const addMilestone = el(
    "form",
    {
      class: "pm-inline-form",
      onsubmit: async (event) => {
        event.preventDefault();
        if (!title.value.trim()) return;
        const created = await run(
          sb.from("pm_milestones").insert({
            project_id: p.id,
            title: title.value.trim(),
            target_date: target.value || null,
            sort_order: milestones.length,
          }).select().single()
        );
        if (!created) return;
        state.milestones.push(created);
        route();
      },
    },
    title,
    target,
    el("button", { type: "submit", class: "btn btn-ghost-light btn-sm", text: "Add milestone" })
  );

  return el("section", { class: "pm-panel" }, el("h2", { text: "Roadmap & checklist" }), milestoneBlocks, looseBlock, addMilestone);
}

function renderNotesPanel(p) {
  const notes = projectNotes(p.id);
  const body = el("textarea", { rows: 2, placeholder: "Key info, a decision, or a log entry…", required: true });
  const kind = el("select", { "aria-label": "Note type" }, options(NOTE_KINDS, "log", NOTE_KIND_LABELS));

  const list = el(
    "ul",
    { class: "pm-notes" },
    notes.map((n) =>
      el(
        "li",
        { class: `pm-note${n.pinned ? " is-pinned" : ""}` },
        el(
          "div",
          { class: "pm-note-head" },
          el("span", { class: `pm-badge k-${n.kind}`, text: NOTE_KIND_LABELS[n.kind] || n.kind }),
          el("time", { text: formatDate(n.created_at) }),
          clientChip(n.visible_to_client),
          visibleToggleButton(n.visible_to_client, "note", async () => {
            const updated = await run(
              sb.from("pm_notes").update({ visible_to_client: !n.visible_to_client }).eq("id", n.id).select().single()
            );
            if (updated) Object.assign(n, updated);
            route();
          }),
          el("button", {
            type: "button",
            class: "pm-icon-btn",
            title: n.pinned ? "Unpin" : "Pin",
            text: n.pinned ? "★" : "☆",
            onclick: async () => {
              const updated = await run(
                sb.from("pm_notes").update({ pinned: !n.pinned }).eq("id", n.id).select().single()
              );
              if (updated) Object.assign(n, updated);
              route();
            },
          }),
          el("button", {
            type: "button",
            class: "pm-icon-btn",
            title: "Delete note",
            text: "×",
            onclick: async () => {
              if (!window.confirm("Delete this note?")) return;
              if (!(await run(sb.from("pm_notes").delete().eq("id", n.id)))) return;
              state.notes = state.notes.filter((x) => x.id !== n.id);
              route();
            },
          })
        ),
        el("p", { class: "pm-note-body", text: n.body })
      )
    )
  );

  const form = el(
    "form",
    {
      class: "pm-inline-form pm-note-form",
      onsubmit: async (event) => {
        event.preventDefault();
        if (!body.value.trim()) return;
        const created = await run(
          sb.from("pm_notes").insert({ project_id: p.id, kind: kind.value, body: body.value.trim() }).select().single()
        );
        if (!created) return;
        state.notes.unshift(created);
        route();
      },
    },
    body,
    kind,
    el("button", { type: "submit", class: "btn btn-ghost-light btn-sm", text: "Add note" })
  );

  return el("section", { class: "pm-panel" }, el("h2", { text: "Notes & decisions" }), form, list);
}

function renderDangerPanel(p) {
  return el(
    "section",
    { class: "pm-panel pm-danger" },
    el("button", {
      type: "button",
      class: "btn btn-ghost-light btn-sm",
      text: "Delete project",
      onclick: async () => {
        if (!window.confirm(`Delete "${p.name}" with all its milestones, tasks and notes? This cannot be undone.`)) return;
        if (!(await run(sb.from("pm_projects").delete().eq("id", p.id), "Project deleted"))) return;
        state.projects = state.projects.filter((x) => x.id !== p.id);
        state.milestones = state.milestones.filter((x) => x.project_id !== p.id);
        state.tasks = state.tasks.filter((x) => x.project_id !== p.id);
        state.notes = state.notes.filter((x) => x.project_id !== p.id);
        window.location.hash = "";
      },
    })
  );
}

/* ---------- auth ----------
   Login happens only in admin.html (same origin → same Supabase session in
   localStorage). Signed-out visitors get a link to admin.html?next=pm,
   which sends them back here after the GitHub round-trip. */

function showAuthState(which) {
  document.getElementById("pm-login").hidden = which !== "login";
  document.getElementById("pm-forbidden").hidden = which !== "forbidden";
  document.getElementById("pm-app").hidden = which !== "authorized";
  document.getElementById("btn-logout").hidden = which !== "authorized";
}

async function checkAuthAndRoute() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    authorizedUserId = null;
    showAuthState("login");
    return;
  }
  const { data: isAdmin, error } = await sb.rpc("is_portfolio_admin");
  if (error || !isAdmin) {
    authorizedUserId = null;
    showAuthState("forbidden");
    return;
  }
  authorizedUserId = session.user.id;
  showAuthState("authorized");
  await loadAll();
}

/* Mirrors shouldRerouteOnAuthEvent() in scripts/lib/admin-auth.mjs. */
function shouldReroute(event, userId) {
  if (event === "TOKEN_REFRESHED") return false;
  if (event === "SIGNED_OUT") return true;
  return !(userId && userId === authorizedUserId);
}

async function init() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    showAuthState("login");
    document.getElementById("login-status").textContent = "Could not load Supabase. Check your connection and reload.";
    return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  document.getElementById("btn-logout").addEventListener("click", () => sb.auth.signOut());
  document.getElementById("btn-logout-forbidden").addEventListener("click", () => sb.auth.signOut());
  document.getElementById("btn-new-project").addEventListener("click", openNewForm);
  document.getElementById("btn-cancel-new").addEventListener("click", () => {
    document.getElementById("pm-new-form").hidden = true;
  });
  document.getElementById("pm-new-form").addEventListener("submit", handleNewProject);
  document.getElementById("pm-search").addEventListener("input", (event) => {
    state.filter.q = event.target.value.trim();
    renderList();
  });
  window.addEventListener("hashchange", route);

  sb.auth.onAuthStateChange((event, session) => {
    if (shouldReroute(event, session?.user?.id)) setTimeout(checkAuthAndRoute, 0);
  });
  await checkAuthAndRoute();
}

document.addEventListener("DOMContentLoaded", init);
