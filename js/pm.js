/* Personal project manager (pm.html).
   Data lives in the shared Supabase project, tables prefixed "pm_"
   (pm_clients, pm_projects, pm_milestones, pm_tasks, pm_notes). Every
   table is admin-only under RLS (is_portfolio_admin()), so nothing here is
   readable without the same GitHub login the portfolio admin uses.
   UI is built with DOM nodes + textContent only (no innerHTML with data). */

const PM_STATUSES = ["idea", "planned", "active", "paused", "done", "archived"];
const MILESTONE_STATUSES = ["planned", "active", "done", "dropped"];
const NOTE_KINDS = ["info", "decision", "log", "update"];
const TASK_PRIORITIES = ["normal", "high", "urgent"];
const TASK_PRIORITY_LABELS = { normal: "Normal", high: "High", urgent: "Urgent" };
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
  // Cloudflare Pages serves pm.html at the clean URL /pm, so accept both.
  const basePath = pathname.replace(/pm(\.html)?\/?$/, "");
  return `${origin}${basePath}follow/?t=${token}`;
}

/* ---------- ordering helpers (pure) ---------- */

/* mode "date" (default): due date, oldest first, undated last, ties by
   manual order. mode "manual": manual order only. */
function orderedTasks(tasks, mode) {
  const manual = (a, b) => ((a.sort_order || 0) - (b.sort_order || 0)) || String(a.created_at).localeCompare(String(b.created_at));
  return [...tasks].sort((a, b) => {
    if (mode !== "manual") {
      if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
      if (a.due_date && !b.due_date) return -1;
      if (!a.due_date && b.due_date) return 1;
    }
    return manual(a, b);
  });
}

/* Moves one item up (-1) or down (+1) inside an already-ordered list and
   returns the new order (same array contents; unchanged at the edges). */
function moveInList(list, id, delta) {
  const i = list.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/* Moves an item to a 0-based position. */
function moveToPosition(list, id, position) {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return [...list];
  const out = [...list];
  const [item] = out.splice(i, 1);
  out.splice(Math.max(0, Math.min(position, out.length)), 0, item);
  return out;
}

function phaseStats(tasks) {
  const done = tasks.filter((t) => t.done).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

/* ---------- stack detection from a public GitHub repo ---------- */

function parseGithubRepo(url) {
  const m = String(url || "").trim().match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

const LANGUAGE_LABELS = { PLpgSQL: "PostgreSQL", "Jupyter Notebook": "Jupyter", Shell: null, Batchfile: null, Makefile: null };
const NPM_STACK = {
  react: "React", next: "Next.js", vue: "Vue", nuxt: "Nuxt", svelte: "Svelte", "@sveltejs/kit": "SvelteKit",
  astro: "Astro", vite: "Vite", tailwindcss: "Tailwind CSS", typescript: "TypeScript", express: "Express",
  "@supabase/supabase-js": "Supabase", firebase: "Firebase", "react-router-dom": "React Router",
  recharts: "Recharts", "chart.js": "Chart.js", d3: "D3", plotly: "Plotly", "plotly.js": "Plotly",
  "@tanstack/react-query": "TanStack Query", zustand: "Zustand", sortablejs: "SortableJS",
};
const PY_STACK = {
  pandas: "pandas", numpy: "NumPy", dash: "Plotly Dash", plotly: "Plotly", streamlit: "Streamlit",
  flask: "Flask", fastapi: "FastAPI", django: "Django", requests: "requests", sqlalchemy: "SQLAlchemy",
  openpyxl: "openpyxl", supabase: "Supabase", gspread: "gspread", scikit_learn: "scikit-learn", "scikit-learn": "scikit-learn",
};
const ROOT_FILE_STACK = {
  "wrangler.toml": "Cloudflare", "wrangler.json": "Cloudflare", "vercel.json": "Vercel", "netlify.toml": "Netlify",
  supabase: "Supabase", dockerfile: "Docker", "docker-compose.yml": "Docker", ".github": null,
};

/* languages: { Name: bytes }, rootNames: file/dir names at the repo root,
   packageJson: parsed object | null, requirements: text | null. */
function stackFromRepoData({ languages = {}, rootNames = [], packageJson = null, requirements = null }) {
  const out = [];
  const add = (label) => { if (label && !out.includes(label)) out.push(label); };
  const total = Object.values(languages).reduce((a, b) => a + b, 0) || 1;
  Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .filter(([, bytes]) => bytes / total >= 0.05)
    .forEach(([name]) => add(Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, name) ? LANGUAGE_LABELS[name] : name));
  if (packageJson) {
    const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
    Object.keys(deps).forEach((d) => add(NPM_STACK[d]));
  }
  if (requirements) {
    requirements.split(/\r?\n/).forEach((line) => {
      const name = line.trim().toLowerCase().split(/[=<>~!\[; ]/)[0];
      if (name) add(PY_STACK[name]);
    });
  }
  rootNames.forEach((n) => add(ROOT_FILE_STACK[n.toLowerCase()]));
  return out;
}

/* Keeps what is already there (in order) and appends anything new. */
function mergeStack(existing, detected) {
  const out = existing.map((x) => x.trim()).filter(Boolean);
  const seen = new Set(out.map((x) => x.toLowerCase()));
  detected.forEach((d) => { if (!seen.has(d.toLowerCase())) { out.push(d); seen.add(d.toLowerCase()); } });
  return out;
}

async function fetchRepoStack(repoUrl) {
  const ref = parseGithubRepo(repoUrl);
  if (!ref) throw new Error("Add a GitHub repo link first (Edit links → repo).");
  const base = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;
  const get = async (path) => {
    const res = await fetch(`${base}${path}`, { headers: { Accept: "application/vnd.github+json" } });
    if (res.status === 404) return null;
    if (res.status === 403) throw new Error("GitHub rate limit reached — try again in a few minutes.");
    if (!res.ok) throw new Error(`GitHub returned ${res.status}.`);
    return res.json();
  };
  const languages = await get("/languages");
  if (languages === null) throw new Error("Repo not found or private. Only public repos can be read.");
  const root = (await get("/contents/")) || [];
  const names = root.map((f) => f.name);
  const readText = async (name) => {
    if (!names.includes(name)) return null;
    const file = await get(`/contents/${name}`);
    return file && file.content ? new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\n/g, "")), (c) => c.charCodeAt(0))) : null;
  };
  let packageJson = null;
  try { packageJson = JSON.parse((await readText("package.json")) || "null"); } catch (e) { packageJson = null; }
  const requirements = await readText("requirements.txt");
  return stackFromRepoData({ languages, rootNames: names, packageJson, requirements });
}

/* The Client view panel's "nothing exposed by accident" summary line. */
function clientViewSummary(tasksVisible, milestonesVisible, updatesVisible) {
  return `${tasksVisible} tasks, ${milestonesVisible} phases, ${updatesVisible} updates visible`;
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
const projectMilestones = (id) =>
  state.milestones
    .filter((m) => m.project_id === id)
    .sort((a, b) => (a.sort_order - b.sort_order) || String(a.created_at).localeCompare(String(b.created_at)));
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

let lastRouteKey = null;
const renderList = () => keepScroll(renderListView);
const renderDetail = (p) => keepScroll(() => renderDetailView(p));
let listScrollY = 0;

/* Re-renders (after an edit, toggle or filter) must not move the page: the
   rebuilt DOM would otherwise reset the scroll position. */
function keepScroll(render) {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

function route() {
  const match = window.location.hash.match(/^#p\/(.+)$/);
  const project = match && state.projects.find((p) => p.slug === decodeURIComponent(match[1]));
  const key = project ? project.slug : "list";
  const changedView = key !== lastRouteKey;
  if (changedView && lastRouteKey === "list") listScrollY = window.scrollY;
  document.getElementById("pm-list-view").hidden = Boolean(project);
  document.getElementById("pm-detail-view").hidden = !project;
  keepScroll(() => {
    if (project) renderDetail(project);
    else renderList();
  });
  // Only a real navigation moves the page: a project opens at its top,
  // and going back to the list returns to where you were.
  if (changedView) window.scrollTo(0, project ? 0 : listScrollY);
  lastRouteKey = key;
}

async function saveOrder(table, stateKey, ordered) {
  const changed = [];
  ordered.forEach((row, index) => {
    if (row.sort_order !== index) changed.push([row, index]);
  });
  if (!changed.length) return true;
  const results = await Promise.all(
    changed.map(([row, index]) => run(sb.from(table).update({ sort_order: index }).eq("id", row.id).select().single()))
  );
  if (results.some((r) => !r)) return false;
  changed.forEach(([row, index], k) => { row.sort_order = index; if (results[k] && results[k].updated_at) row.updated_at = results[k].updated_at; });
  return true;
}

async function moveTask(task, delta) {
  const group = state.tasks.filter((t) => t.project_id === task.project_id && t.milestone_id === task.milestone_id);
  const ordered = moveInList(orderedTasks(group, "manual"), task.id, delta);
  if (await saveOrder("pm_tasks", "tasks", ordered)) route();
}

async function movePhase(m, delta) {
  const ordered = moveInList(projectMilestones(m.project_id), m.id, delta);
  if (await saveOrder("pm_milestones", "milestones", ordered)) route();
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
    stat(open.filter((p) => p.status === "active").length, "active projects"),
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

function renderListView() {
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
    ...state.clients.map((c) => el("option", { value: c.id, text: c.name, selected: c.id === selectedId, "data-no-i18n": "" })),
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

function renderDetailView(p) {
  const view = document.getElementById("pm-detail-view");
  const prog = progress(p.id);

  const header = el(
    "div",
    { class: "pm-detail-head" },
    el("a", { href: "#", class: "pm-back", text: "← All projects" }),
    el("h1", { class: "pm-title", text: p.name, "data-no-i18n": "" }),
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

/* Stack input + "Detect from repo": reads the public GitHub repo linked under
   Edit links → repo and merges what it finds into the field (nothing is saved
   until the form's Save button is pressed). */
function stackField(p) {
  const input = el("input", { type: "text", name: "stack", value: (p.stack || []).join(", ") });
  const button = el("button", {
    type: "button",
    class: "btn btn-ghost-light btn-sm",
    text: "Detect from repo",
    onclick: async (event) => {
      const form = event.target.closest("form");
      const repoInput = form && form.querySelector('input[name="link_repo"]');
      const repoUrl = (repoInput && repoInput.value) || (p.links || {}).repo;
      button.disabled = true;
      try {
        const detected = await fetchRepoStack(repoUrl);
        const merged = mergeStack(input.value.split(","), detected);
        const added = merged.length - input.value.split(",").map((x) => x.trim()).filter(Boolean).length;
        input.value = merged.join(", ");
        toast(added > 0 ? `Detected ${added} new item(s) — review and press Save` : "Stack is already up to date");
      } catch (error) {
        toast(error.message, "err");
      } finally {
        button.disabled = false;
      }
    },
  });
  return el("label", { class: "pm-field" }, el("span", { text: "Stack (comma-separated)" }), el("div", { class: "pm-inline-form" }, input, button));
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
    stackField(p),
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

let editingTaskId = null;

function priorityBadge(task) {
  return task.priority && task.priority !== "normal"
    ? el("span", { class: `pm-badge pm-prio-${task.priority}`, text: TASK_PRIORITY_LABELS[task.priority] })
    : null;
}

function taskEditForm(task) {
  const title = el("input", { type: "text", value: task.title, required: true, "aria-label": "Task title" });
  const due = el("input", { type: "date", value: task.due_date || "", "aria-label": "Due date" });
  const priority = el("select", { "aria-label": "Task priority" }, options(TASK_PRIORITIES, task.priority || "normal", TASK_PRIORITY_LABELS));
  const phase = el("select", { "aria-label": "Phase" },
    el("option", { value: "", text: "— No phase —", selected: !task.milestone_id }),
    ...projectMilestones(task.project_id).map((m) =>
      el("option", { value: m.id, text: m.title, selected: m.id === task.milestone_id, "data-no-i18n": "" }))
  );
  const owner = el("select", { "aria-label": "Owner" }, options(["me", "client"], task.owner || "me", { me: "Me", client: "Client" }));
  const visible = el("input", { type: "checkbox", checked: Boolean(task.visible_to_client) });
  const form = el(
    "form",
    {
      class: "pm-inline-form pm-task-edit",
      onsubmit: async (event) => {
        event.preventDefault();
        const newTitle = title.value.trim();
        if (!newTitle) return;
        const updated = await run(
          sb.from("pm_tasks").update({
            title: newTitle,
            due_date: due.value || null,
            priority: priority.value,
            milestone_id: phase.value || null,
            owner: owner.value,
            visible_to_client: visible.checked,
          }).eq("id", task.id).select().single(),
          "Saved"
        );
        if (!updated) return;
        Object.assign(task, updated);
        editingTaskId = null;
        route();
      },
    },
    title, due, priority, phase, owner,
    el("label", { class: "pm-field pm-inline-field" }, visible, el("span", { text: "Show to client" })),
    el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Save" }),
    el("button", { type: "button", class: "btn btn-ghost-light btn-sm", text: "Cancel", onclick: () => { editingTaskId = null; route(); } })
  );
  return el("li", { class: "pm-task is-editing" }, form);
}

function arrowButtons(label, onUp, onDown, upDisabled, downDisabled) {
  return [
    el("button", { type: "button", class: "pm-icon-btn", title: `Move ${label} up`, text: "↑", disabled: upDisabled, onclick: onUp }),
    el("button", { type: "button", class: "pm-icon-btn", title: `Move ${label} down`, text: "↓", disabled: downDisabled, onclick: onDown }),
  ];
}

function taskRow(task, position, groupSize) {
  if (editingTaskId === task.id) return taskEditForm(task);
  const project = state.projects.find((x) => x.id === task.project_id);
  const manual = project && project.task_sort === "manual";
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
    priorityBadge(task),
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
    ...(manual
      ? arrowButtons("task", () => moveTask(task, -1), () => moveTask(task, 1), position === 0, position === groupSize - 1)
      : []),
    el("button", {
      type: "button",
      class: "pm-icon-btn",
      title: "Edit task",
      text: "✎",
      onclick: () => { editingTaskId = task.id; route(); },
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
  const owner = el("select", { "aria-label": "Owner" }, options(["me", "client"], "me", { me: "Me", client: "Client" }));
  const priority = el("select", { "aria-label": "Task priority" }, options(TASK_PRIORITIES, "normal", TASK_PRIORITY_LABELS));
  const visible = el("input", { type: "checkbox" });
  const phase = el("select", { "aria-label": "Phase" },
    el("option", { value: "", text: "— No phase —", selected: !milestoneId }),
    ...projectMilestones(projectId).map((m) =>
      el("option", { value: m.id, text: m.title, selected: m.id === milestoneId, "data-no-i18n": "" }))
  );
  // A task for the client is almost always meant to be seen by them.
  owner.addEventListener("change", () => { visible.checked = owner.value === "client"; });
  return el(
    "form",
    {
      class: "pm-inline-form",
      onsubmit: async (event) => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) return;
        const targetPhase = phase.value || null;
        const siblings = state.tasks.filter((t) => t.project_id === projectId && t.milestone_id === targetPhase);
        const created = await run(
          sb.from("pm_tasks").insert({
            project_id: projectId,
            milestone_id: targetPhase,
            title,
            due_date: due.value || null,
            owner: owner.value,
            visible_to_client: visible.checked,
            priority: priority.value,
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
    phase,
    owner,
    priority,
    el("label", { class: "pm-field pm-inline-field" }, visible, el("span", { text: "Show to client" })),
    el("button", { type: "submit", class: "btn btn-ghost-light btn-sm", text: "Add" })
  );
}

let editingPhaseId = null;

function phaseEditForm(m, total) {
  const title = el("input", { type: "text", value: m.title, required: true, "aria-label": "Phase name" });
  const target = el("input", { type: "date", value: m.target_date || "", "aria-label": "Target date" });
  const description = el("input", { type: "text", value: m.description || "", placeholder: "Description (optional)", "aria-label": "Description" });
  const status = el("select", { "aria-label": "Phase status" }, options(MILESTONE_STATUSES, m.status));
  const current = projectMilestones(m.project_id).findIndex((x) => x.id === m.id);
  const position = el("select", { "aria-label": "Order" },
    Array.from({ length: total }, (_, i) => el("option", { value: String(i), text: `#${i + 1}`, selected: i === current })));
  return el(
    "form",
    {
      class: "pm-inline-form pm-phase-edit",
      onsubmit: async (event) => {
        event.preventDefault();
        const name = title.value.trim();
        if (!name) return;
        const updated = await run(
          sb.from("pm_milestones").update({
            title: name,
            target_date: target.value || null,
            description: description.value.trim() || null,
            status: status.value,
          }).eq("id", m.id).select().single(),
          "Saved"
        );
        if (!updated) return;
        Object.assign(m, updated);
        const ordered = moveToPosition(projectMilestones(m.project_id), m.id, Number(position.value));
        if (!(await saveOrder("pm_milestones", "milestones", ordered))) return;
        editingPhaseId = null;
        route();
      },
    },
    title, target, description, status, position,
    el("button", { type: "submit", class: "btn btn-primary btn-sm", text: "Save" }),
    el("button", { type: "button", class: "btn btn-ghost-light btn-sm", text: "Cancel", onclick: () => { editingPhaseId = null; route(); } })
  );
}

/* Bar of phases with per-phase progress, shown at the top of the project. */
function renderPhaseTracker(p) {
  const milestones = projectMilestones(p.id);
  if (!milestones.length) return null;
  const tasks = projectTasks(p.id);
  const doneCount = milestones.filter((m) => m.status === "done").length;
  return el(
    "div",
    { class: "pm-phase-tracker", role: "list", "aria-label": "Phase status" },
    el("p", { class: "pm-muted pm-phase-summary", text: `${doneCount}/${milestones.length} phases complete` }),
    el(
      "div",
      { class: "pm-phase-bar" },
      milestones.map((m, i) => {
        const stats = phaseStats(tasks.filter((t) => t.milestone_id === m.id));
        const pct = m.status === "done" ? 100 : stats.pct;
        return el(
          "div",
          { class: `pm-phase-seg s-${m.status}`, role: "listitem" },
          el("div", { class: "pm-phase-seg-top" },
            el("strong", { text: `${i + 1}. ${m.title}`, "data-no-i18n": "" }),
            el("span", { class: `pm-badge s-${m.status}`, text: m.status })),
          el("div", { class: "pm-progress", title: `${stats.done}/${stats.total} tasks` },
            el("span", { style: `width:${pct}%` })),
          el("div", { class: "pm-phase-seg-meta" },
            el("span", { text: stats.total ? `${stats.done}/${stats.total} tasks` : "No tasks yet" }),
            m.target_date ? el("span", { class: isOverdue(m.target_date) && m.status !== "done" ? "is-overdue" : "", text: formatDate(m.target_date) }) : null)
        );
      })
    )
  );
}

function renderRoadmapPanel(p) {
  const milestones = projectMilestones(p.id);
  const tasks = projectTasks(p.id);

  const milestoneBlocks = milestones.map((m, phaseIndex) => {
    if (editingPhaseId === m.id) return el("div", { class: "pm-milestone s-" + m.status }, phaseEditForm(m, milestones.length));
    const mTasks = orderedTasks(tasks.filter((t) => t.milestone_id === m.id), p.task_sort);
    const statusSelect = el("select", {
      class: `pm-badge-select s-${m.status}`,
      "aria-label": "Phase status",
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
        el("h3", { text: m.title, "data-no-i18n": "" }),
        statusSelect,
        mTasks.length ? el("span", { class: "pm-task-due", text: `${mTasks.filter((t) => t.done).length}/${mTasks.length} tasks` }) : null,
        m.status !== "done"
          ? el("button", {
              type: "button",
              class: "btn btn-ghost-light btn-sm",
              text: "Mark phase complete",
              onclick: async () => {
                const updated = await run(
                  sb.from("pm_milestones").update({ status: "done" }).eq("id", m.id).select().single(),
                  "Phase marked complete"
                );
                if (updated) Object.assign(m, updated);
                route();
              },
            })
          : null,
        m.target_date ? el("span", { class: "pm-task-due", text: formatDate(m.target_date) }) : null,
        clientChip(m.visible_to_client),
        visibleToggleButton(m.visible_to_client, `phase "${m.title}"`, async () => {
          const updated = await run(
            sb.from("pm_milestones").update({ visible_to_client: !m.visible_to_client }).eq("id", m.id).select().single()
          );
          if (updated) Object.assign(m, updated);
          route();
        }),
        ...arrowButtons("phase", () => movePhase(m, -1), () => movePhase(m, 1), phaseIndex === 0, phaseIndex === milestones.length - 1),
        el("button", { type: "button", class: "pm-icon-btn", title: "Edit phase", text: "✎", onclick: () => { editingPhaseId = m.id; route(); } }),
        el("button", {
          type: "button",
          class: "pm-icon-btn",
          title: "Delete phase (tasks are kept, ungrouped)",
          text: "×",
          onclick: async () => {
            if (!window.confirm(`Delete phase "${m.title}"? Its tasks are kept.`)) return;
            if (!(await run(sb.from("pm_milestones").delete().eq("id", m.id)))) return;
            state.milestones = state.milestones.filter((x) => x.id !== m.id);
            state.tasks.forEach((t) => { if (t.milestone_id === m.id) t.milestone_id = null; });
            route();
          },
        })
      ),
      m.description ? el("p", { class: "pm-muted pm-milestone-desc", text: m.description }) : null,
      el("ul", { class: "pm-tasks" }, mTasks.map((t, i) => taskRow(t, i, mTasks.length))),
      addTaskForm(p.id, m.id)
    );
  });

  const loose = orderedTasks(tasks.filter((t) => !t.milestone_id), p.task_sort);
  const looseBlock = el(
    "div",
    { class: "pm-milestone is-loose" },
    el("div", { class: "pm-milestone-head" }, el("h3", { text: milestones.length ? "Other tasks" : "Checklist" })),
    el("ul", { class: "pm-tasks" }, loose.map((t, i) => taskRow(t, i, loose.length))),
    addTaskForm(p.id, null)
  );

  const title = el("input", { type: "text", placeholder: "New phase (e.g. Phase 1)…", required: true });
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
    el("button", { type: "submit", class: "btn btn-ghost-light btn-sm", text: "Add phase" })
  );

  const sortSelect = el("select", {
    "aria-label": "Task order",
    onchange: async (event) => {
      const updated = await run(sb.from("pm_projects").update({ task_sort: event.target.value }).eq("id", p.id).select().single());
      if (updated) Object.assign(p, updated);
      route();
    },
  }, options(["date", "manual"], p.task_sort || "date", { date: "Task order: by due date", manual: "Task order: manual (↑ ↓)" }));

  return el(
    "section",
    { class: "pm-panel" },
    el("div", { class: "pm-toolbar" }, el("h2", { text: "Phases & checklist" }), sortSelect),
    renderPhaseTracker(p),
    milestoneBlocks,
    looseBlock,
    addMilestone
  );
}

function renderNotesPanel(p) {
  const notes = projectNotes(p.id);
  const body = el("textarea", { rows: 2, placeholder: "Key info, a decision, or a log entry…", required: true });
  const kind = el("select", { "aria-label": "Note type" }, options(NOTE_KINDS, "log", NOTE_KIND_LABELS));
  const showToClient = el("input", { type: "checkbox" });
  // Notes written to the client ("Client update") are meant to be seen by them.
  kind.addEventListener("change", () => { showToClient.checked = kind.value === "update"; });

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
          sb.from("pm_notes").insert({ project_id: p.id, kind: kind.value, body: body.value.trim(), visible_to_client: showToClient.checked }).select().single()
        );
        if (!created) return;
        state.notes.unshift(created);
        route();
      },
    },
    body,
    kind,
    el("label", { class: "pm-field pm-inline-field" }, showToClient, el("span", { text: "Show to client" })),
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
        if (!window.confirm(`Delete "${p.name}" with all its phases, tasks and notes? This cannot be undone.`)) return;
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
