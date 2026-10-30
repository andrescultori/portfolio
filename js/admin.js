/* Admin panel: edits portfolio_projects in Supabase, authenticated via
   GitHub OAuth (Supabase Auth). Row Level Security only allows writes from
   GitHub accounts listed in portfolio_admins — this client-side check is
   just for a nicer UI, the real enforcement lives in Postgres. */

let supabaseClient = null;
const STORAGE_BUCKET = "portfolio-images";

let PROJECTS = [];
let EDITING_SLUG = null; // null = creating a new project

let AUTHORIZED_USER_ID = null; // id of the user currently shown as "authorized"
let FORMS_DIRTY = false; // unsaved changes in #project-form or #site-settings-form

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function setStatus(el, text, type) {
  if (!el) return;
  el.className = "form-status" + (type ? ` ${type}` : "");
  el.textContent = text;
}

function showAuthState(state) {
  // state: "login" | "forbidden" | "authorized"
  document.getElementById("admin-login").style.display = state === "login" ? "block" : "none";
  document.getElementById("admin-forbidden").style.display = state === "forbidden" ? "block" : "none";
  document.getElementById("admin-tabs").style.display = state === "authorized" ? "flex" : "none";
  document.getElementById("admin-panel").style.display = state === "authorized" ? "block" : "none";
  document.getElementById("admin-form-section").style.display = "none";
  document.getElementById("admin-site-section").style.display = "none";
  document.getElementById("btn-logout").style.display = state === "login" ? "none" : "inline-flex";
  if (state === "authorized") {
    document.getElementById("btn-tab-projects").className = "btn btn-primary btn-sm";
    document.getElementById("btn-tab-site").className = "btn btn-ghost-light btn-sm";
  }
}

function markFormDirty() {
  FORMS_DIRTY = true;
}

function clearFormDirty() {
  FORMS_DIRTY = false;
}

window.addEventListener("beforeunload", (e) => {
  if (!FORMS_DIRTY) return;
  e.preventDefault();
  e.returnValue = "";
});

function showFormSection() {
  document.getElementById("admin-panel").style.display = "none";
  document.getElementById("admin-form-section").style.display = "block";
}

function showPanelSection() {
  document.getElementById("admin-form-section").style.display = "none";
  document.getElementById("admin-panel").style.display = "block";
}

function mapRowToProject(row) {
  return {
    slug: row.slug,
    title: row.title,
    cardImage: row.card_image || "",
    screenshots: row.screenshots || [],
    description: row.description || { pt: "", en: "" },
    stack: row.stack || [],
    links: row.links || {},
    note: row.note || null,
    commercial: !!row.commercial,
    featured: !!row.featured,
    sortOrder: row.sort_order || 0,
    draft: !!row.draft,
  };
}

function projectToRow(project) {
  return {
    slug: project.slug,
    title: project.title,
    card_image: project.cardImage || "",
    screenshots: project.screenshots,
    description: project.description,
    stack: project.stack,
    links: project.links,
    note: project.note,
    commercial: project.commercial,
    featured: project.featured,
    sort_order: project.sortOrder,
    draft: project.draft,
  };
}

async function checkAuthAndRoute() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      AUTHORIZED_USER_ID = null;
      showAuthState("login");
      return;
    }
    const { data: isAdmin, error } = await supabaseClient.rpc("is_portfolio_admin");
    if (error || !isAdmin) {
      AUTHORIZED_USER_ID = null;
      showAuthState("forbidden");
      return;
    }
    AUTHORIZED_USER_ID = session.user.id;
    showAuthState("authorized");
    await loadProjects();
  } catch (err) {
    AUTHORIZED_USER_ID = null;
    showAuthState("login");
    setStatus(document.getElementById("login-status"), `Erro ao verificar sessão: ${err.message}`, "err");
  }
}

/* Mirrors shouldRerouteOnAuthEvent() in scripts/lib/admin-auth.mjs (that
   Node module can't be imported from this browser classic script). Keep
   both in sync if the rule changes. */
function shouldRerouteOnAuthEvent(event, userId, authorizedUserId) {
  if (event === "TOKEN_REFRESHED") return false;
  if (event === "SIGNED_OUT") return true;
  if (userId && userId === authorizedUserId) return false;
  return true;
}

async function handleAuthStateChange(event, session) {
  const userId = session && session.user ? session.user.id : null;
  if (!shouldRerouteOnAuthEvent(event, userId, AUTHORIZED_USER_ID)) {
    // Same admin re-confirming (tab regained focus, token silently
    // refreshed) — never reroute or reload, it would wipe whatever is
    // mid-typing in the Projects or Site forms.
    return;
  }
  await checkAuthAndRoute();
}

async function loadProjects() {
  const panelStatus = document.getElementById("panel-status");
  setStatus(panelStatus, "Carregando projetos…", "");
  const { data, error } = await supabaseClient
    .from("portfolio_projects")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    setStatus(panelStatus, `Não foi possível carregar os projetos: ${error.message}`, "err");
    return;
  }
  PROJECTS = data.map(mapRowToProject);
  setStatus(panelStatus, "", "");
  renderCards();
  initSortable();
}

function renderCards() {
  const wrap = document.getElementById("projects-cards");
  wrap.innerHTML = "";

  if (PROJECTS.length === 0) {
    wrap.innerHTML = `<p class="admin-empty">Nenhum projeto cadastrado ainda.</p>`;
    return;
  }

  PROJECTS.forEach((p) => {
    const badges = [];
    if (p.featured) badges.push("Destaque");
    if (p.commercial) badges.push("Comercial");
    if (p.draft) badges.push("Rascunho");

    const card = document.createElement("article");
    card.className = "admin-project-card";
    card.dataset.slug = p.slug;
    card.innerHTML = `
      <div class="admin-project-card-head">
        <span class="admin-drag-handle" aria-label="Arrastar para reordenar">⠿</span>
        <span class="admin-project-order">#${escapeHtml(p.sortOrder)}</span>
        <div class="admin-project-badges">${badges.map((b) => `<span class="admin-badge">${b}</span>`).join("")}</div>
      </div>
      <h3 class="admin-project-title">${escapeHtml(p.title)}</h3>
      <p class="admin-project-slug">${escapeHtml(p.slug)}</p>
      <div class="admin-project-actions">
        <button type="button" class="btn btn-ghost-light btn-sm" data-action="edit">Editar</button>
        <button type="button" class="btn btn-ghost-light btn-sm" data-action="delete">Excluir</button>
      </div>
    `;
    card.querySelector('[data-action="edit"]').addEventListener("click", () => openForm(p.slug));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteProject(p.slug));
    wrap.appendChild(card);
  });
}

let SORTABLE_INSTANCE = null;

function initSortable() {
  if (typeof Sortable === "undefined") return; // drag-to-reorder unavailable if the CDN failed; list still works
  if (SORTABLE_INSTANCE) {
    SORTABLE_INSTANCE.destroy();
    SORTABLE_INSTANCE = null;
  }
  const wrap = document.getElementById("projects-cards");
  if (!wrap || PROJECTS.length === 0) return;

  SORTABLE_INSTANCE = new Sortable(wrap, {
    animation: 150,
    handle: ".admin-drag-handle",
    ghostClass: "admin-project-card--ghost",
    onEnd: handleReorder,
  });
}

async function handleReorder(evt) {
  const { oldIndex, newIndex } = evt;
  if (oldIndex === newIndex) return;

  const moved = PROJECTS.splice(oldIndex, 1)[0];
  PROJECTS.splice(newIndex, 0, moved);

  const statusEl = document.getElementById("panel-status");
  setStatus(statusEl, "Salvando nova ordem…", "");

  try {
    await Promise.all(
      PROJECTS.map((p, i) => {
        if (p.sortOrder === i) return null;
        p.sortOrder = i;
        return supabaseClient.from("portfolio_projects").update({ sort_order: i }).eq("slug", p.slug);
      })
    );
    setStatus(statusEl, "Ordem salva!", "ok");
    renderCards();
    initSortable();
  } catch (err) {
    setStatus(statusEl, `Erro ao salvar a nova ordem: ${err.message}`, "err");
    await loadProjects();
  }
}

function nextSortOrder() {
  if (PROJECTS.length === 0) return 0;
  return Math.max(...PROJECTS.map((p) => p.sortOrder || 0)) + 1;
}

function openForm(slug) {
  EDITING_SLUG = slug;
  const p = slug === null ? null : PROJECTS.find((x) => x.slug === slug);
  const form = document.getElementById("project-form");
  form.reset();
  setStatus(document.getElementById("form-status-msg"), "", "");
  setStatus(document.getElementById("f-cardImage-status"), "", "");
  setStatus(document.getElementById("f-screenshot-status"), "", "");

  document.getElementById("form-title").textContent = p ? "Editar projeto" : "Novo projeto";
  document.getElementById("f-slug").value = p ? p.slug : "";
  document.getElementById("f-title").value = p ? p.title : "";
  document.getElementById("f-cardImage").value = p ? p.cardImage || "" : "";
  document.getElementById("f-screenshots").value = p && p.screenshots ? p.screenshots.join("\n") : "";
  document.getElementById("f-desc-pt").value = p && p.description ? p.description.pt || "" : "";
  document.getElementById("f-desc-en").value = p && p.description ? p.description.en || "" : "";
  document.getElementById("f-stack").value = p && p.stack ? p.stack.join(", ") : "";
  document.getElementById("f-live").value = p && p.links ? p.links.live || "" : "";
  document.getElementById("f-github").value = p && p.links ? p.links.github || "" : "";
  document.getElementById("f-note-pt").value = p && p.note ? p.note.pt || "" : "";
  document.getElementById("f-note-en").value = p && p.note ? p.note.en || "" : "";
  document.getElementById("f-commercial").checked = !!(p && p.commercial);
  document.getElementById("f-featured").checked = !!(p && p.featured);
  document.getElementById("f-draft").checked = !!(p && p.draft);

  clearFormDirty();
  showFormSection();
}

async function uploadImage(file, slugHint, statusEl) {
  setStatus(statusEl, "Enviando imagem…", "");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeSlug =
    (slugHint || "projeto")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "projeto";
  const path = `${safeSlug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) {
    setStatus(statusEl, `Erro ao enviar imagem: ${error.message}`, "err");
    return null;
  }

  const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  setStatus(statusEl, "Imagem enviada!", "ok");
  return data.publicUrl;
}

async function handleCardImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const slugHint = document.getElementById("f-slug").value;
  const url = await uploadImage(file, slugHint, document.getElementById("f-cardImage-status"));
  if (url) document.getElementById("f-cardImage").value = url;
  e.target.value = "";
}

async function handleScreenshotUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const slugHint = document.getElementById("f-slug").value;
  const url = await uploadImage(file, slugHint, document.getElementById("f-screenshot-status"));
  if (url) {
    const textarea = document.getElementById("f-screenshots");
    textarea.value = textarea.value ? textarea.value.replace(/\n+$/, "") + "\n" + url : url;
  }
  e.target.value = "";
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const statusEl = document.getElementById("form-status-msg");

  const slug = document.getElementById("f-slug").value.trim();
  const title = document.getElementById("f-title").value.trim();

  if (!slug) return setStatus(statusEl, "Slug é obrigatório.", "err");
  if (!title) return setStatus(statusEl, "Título é obrigatório.", "err");

  const isDuplicate = PROJECTS.some((p) => p.slug === slug && p.slug !== EDITING_SLUG);
  if (isDuplicate) return setStatus(statusEl, "Já existe um projeto com esse slug.", "err");

  const screenshots = document
    .getElementById("f-screenshots")
    .value.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const stack = document
    .getElementById("f-stack")
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const live = document.getElementById("f-live").value.trim();
  const github = document.getElementById("f-github").value.trim();
  const notePt = document.getElementById("f-note-pt").value.trim();
  const noteEn = document.getElementById("f-note-en").value.trim();
  const existing = EDITING_SLUG === null ? null : PROJECTS.find((p) => p.slug === EDITING_SLUG);

  const project = {
    slug,
    title,
    cardImage: document.getElementById("f-cardImage").value.trim(),
    screenshots,
    description: {
      pt: document.getElementById("f-desc-pt").value.trim(),
      en: document.getElementById("f-desc-en").value.trim(),
    },
    stack,
    links: {},
    note: null,
    commercial: document.getElementById("f-commercial").checked,
    featured: document.getElementById("f-featured").checked,
    sortOrder: existing ? existing.sortOrder : nextSortOrder(),
    draft: document.getElementById("f-draft").checked,
  };
  if (live) project.links.live = live;
  if (github) project.links.github = github;
  if (notePt || noteEn) {
    project.note = {};
    if (notePt) project.note.pt = notePt;
    if (noteEn) project.note.en = noteEn;
  }

  setStatus(statusEl, "Salvando…", "");
  const row = projectToRow(project);

  const { error } =
    EDITING_SLUG === null
      ? await supabaseClient.from("portfolio_projects").insert(row)
      : await supabaseClient.from("portfolio_projects").update(row).eq("slug", EDITING_SLUG);

  if (error) {
    setStatus(statusEl, `Erro ao salvar: ${error.message}`, "err");
    return;
  }

  clearFormDirty();
  setStatus(statusEl, "Salvo! O site já reflete a mudança.", "ok");
  await loadProjects();
  setTimeout(showPanelSection, 900);
}

async function deleteProject(slug) {
  const p = PROJECTS.find((x) => x.slug === slug);
  if (!p) return;
  const ok = window.confirm(`Excluir o projeto "${p.title}"? Essa ação não pode ser desfeita.`);
  if (!ok) return;

  const panelStatus = document.getElementById("panel-status");
  setStatus(panelStatus, "Excluindo…", "");
  const { error } = await supabaseClient.from("portfolio_projects").delete().eq("slug", slug);
  if (error) {
    setStatus(panelStatus, `Erro ao excluir: ${error.message}`, "err");
    return;
  }
  await loadProjects();
}

/* ---------------------------------------------------------------------
   Site settings ("Site" tab): single-row portfolio_site_settings — a
   profile photo, social links, and whitelisted i18n text overrides.
   Mirrors the whitelist in scripts/lib/site-settings.mjs and js/i18n.js
   (duplicated by hand — this is a browser classic script, Node can't
   import it and vice versa). ----------------------------------------- */

const SITE_SETTINGS_TEXT_KEYS = [
  "hero_role",
  "hero_bio",
  "projects_title",
  "projects_subtitle",
  "contact_title",
  "contact_subtitle",
  "footer_tagline",
];
const SITE_SETTINGS_LINK_KEYS = ["github", "linkedin", "instagram"];
const SITE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const SITE_PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/* Metrics strip (home KPIs) — mirrors scripts/lib/site-settings.mjs's
   constants and js/motion.js's validation (duplicated by hand, same as
   every other site-settings whitelist in this codebase). DEFAULT_METRICS
   mirrors the 4 built-in <!-- PRERENDER:METRICS --> items in index.html —
   this is what "Restaurar padrão" below puts back into the editor. */
const METRIC_VALUE_MAX = 999999;
const METRIC_LABEL_MAX = 40;
const METRIC_AFFIX_PATTERN = /^[~+%xkMh]{0,3}$/;
const METRICS_MAX = 6;

const DEFAULT_METRICS = [
  { value: 10, prefix: "", suffix: "+", label: { pt: "cenários (Make.com)", en: "scenarios (Make.com)" }, visible: true },
  { value: 10, prefix: "", suffix: "+", label: { pt: "ferramentas integradas", en: "integrated tools" }, visible: true },
  { value: 80, prefix: "~", suffix: "%", label: { pt: "menos operações manuais", en: "fewer manual operations" }, visible: true },
  {
    value: 15,
    prefix: "",
    suffix: "+",
    label: { pt: "anos gerindo processos e pessoas", en: "years managing processes and people" },
    visible: true,
  },
];

function cloneMetrics(metrics) {
  return metrics.map((m) => ({ ...m, label: { ...m.label } }));
}

let SITE_SETTINGS = { photoPath: "", links: {}, i18nOverrides: { pt: {}, en: {} }, metrics: [] };
let PENDING_PHOTO_PATH = null; // null = no pending change; "" = pending removal
let METRICS_DRAFT = []; // working copy edited in the UI, saved only on submit

function isHttpsUrlAdmin(value) {
  return typeof value === "string" && /^https:\/\//i.test(value.trim());
}

function photoPublicUrl(path) {
  if (!path) return "";
  const base = SUPABASE_URL.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

function showProjectsTab() {
  document.getElementById("admin-site-section").style.display = "none";
  document.getElementById("btn-tab-projects").className = "btn btn-primary btn-sm";
  document.getElementById("btn-tab-site").className = "btn btn-ghost-light btn-sm";
  showPanelSection();
}

function showSiteTab() {
  document.getElementById("admin-panel").style.display = "none";
  document.getElementById("admin-form-section").style.display = "none";
  document.getElementById("admin-site-section").style.display = "block";
  document.getElementById("btn-tab-projects").className = "btn btn-ghost-light btn-sm";
  document.getElementById("btn-tab-site").className = "btn btn-primary btn-sm";
}

function populateSiteForm() {
  PENDING_PHOTO_PATH = null;

  const preview = document.getElementById("s-photo-preview");
  if (SITE_SETTINGS.photoPath) {
    preview.src = photoPublicUrl(SITE_SETTINGS.photoPath);
    preview.style.display = "inline-block";
  } else {
    preview.removeAttribute("src");
    preview.style.display = "none";
  }
  setStatus(document.getElementById("s-photo-status"), "JPG, PNG ou WEBP, até 2 MB.", "");

  const overridesPt = SITE_SETTINGS.i18nOverrides.pt || {};
  const overridesEn = SITE_SETTINGS.i18nOverrides.en || {};
  SITE_SETTINGS_TEXT_KEYS.forEach((key) => {
    document.getElementById(`s-${key}-pt`).value = overridesPt[key] || "";
    document.getElementById(`s-${key}-en`).value = overridesEn[key] || "";
  });

  const links = SITE_SETTINGS.links || {};
  SITE_SETTINGS_LINK_KEYS.forEach((key) => {
    document.getElementById(`s-link-${key}`).value = links[key] || "";
  });

  METRICS_DRAFT = SITE_SETTINGS.metrics && SITE_SETTINGS.metrics.length ? cloneMetrics(SITE_SETTINGS.metrics) : [];
  renderMetricsRows();

  setStatus(document.getElementById("site-form-status"), "", "");
  clearFormDirty();
}

/* Builds one editor row for METRICS_DRAFT[index] with plain DOM APIs —
   never innerHTML with typed/stored data, so textContent/value/label text
   nodes are the only things that ever carry user-authored strings. */
function buildMetricRow(item, index) {
  const row = document.createElement("div");
  row.className = "metrics-editor-row";

  function field(className, labelText, input) {
    const wrap = document.createElement("div");
    wrap.className = `metrics-editor-field ${className}`;
    const label = document.createElement("label");
    label.textContent = labelText;
    const inputId = `s-metric-${index}-${className.replace("metrics-editor-field--", "")}`;
    label.setAttribute("for", inputId);
    input.id = inputId;
    wrap.appendChild(label);
    wrap.appendChild(input);
    return wrap;
  }

  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.min = "0";
  valueInput.max = String(METRIC_VALUE_MAX);
  valueInput.step = "1";
  valueInput.value = String(item.value);
  valueInput.addEventListener("input", () => {
    METRICS_DRAFT[index].value = valueInput.value === "" ? 0 : Math.trunc(Number(valueInput.value));
    markFormDirty();
  });

  const prefixInput = document.createElement("input");
  prefixInput.type = "text";
  prefixInput.maxLength = 3;
  prefixInput.value = item.prefix || "";
  prefixInput.addEventListener("input", () => {
    METRICS_DRAFT[index].prefix = prefixInput.value;
    markFormDirty();
  });

  const suffixInput = document.createElement("input");
  suffixInput.type = "text";
  suffixInput.maxLength = 3;
  suffixInput.value = item.suffix || "";
  suffixInput.addEventListener("input", () => {
    METRICS_DRAFT[index].suffix = suffixInput.value;
    markFormDirty();
  });

  const labelPtInput = document.createElement("input");
  labelPtInput.type = "text";
  labelPtInput.maxLength = METRIC_LABEL_MAX;
  labelPtInput.value = (item.label && item.label.pt) || "";
  labelPtInput.addEventListener("input", () => {
    METRICS_DRAFT[index].label.pt = labelPtInput.value;
    markFormDirty();
  });

  const labelEnInput = document.createElement("input");
  labelEnInput.type = "text";
  labelEnInput.maxLength = METRIC_LABEL_MAX;
  labelEnInput.value = (item.label && item.label.en) || "";
  labelEnInput.addEventListener("input", () => {
    METRICS_DRAFT[index].label.en = labelEnInput.value;
    markFormDirty();
  });

  row.appendChild(field("metrics-editor-field--value", "Valor", valueInput));
  row.appendChild(field("metrics-editor-field--affix", "Prefixo", prefixInput));
  row.appendChild(field("metrics-editor-field--affix", "Sufixo", suffixInput));
  row.appendChild(field("metrics-editor-field--label", "Rótulo (PT)", labelPtInput));
  row.appendChild(field("metrics-editor-field--label", "Rótulo (EN)", labelEnInput));

  const visibleLabel = document.createElement("label");
  visibleLabel.className = "form-check";
  const visibleInput = document.createElement("input");
  visibleInput.type = "checkbox";
  visibleInput.checked = item.visible !== false;
  visibleInput.addEventListener("change", () => {
    METRICS_DRAFT[index].visible = visibleInput.checked;
    markFormDirty();
  });
  visibleLabel.appendChild(visibleInput);
  visibleLabel.appendChild(document.createTextNode(" Mostrar"));
  row.appendChild(visibleLabel);

  const actions = document.createElement("div");
  actions.className = "metrics-editor-actions";

  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "btn btn-ghost-light btn-sm";
  upBtn.textContent = "↑";
  upBtn.setAttribute("aria-label", "Mover indicador para cima");
  upBtn.disabled = index === 0;
  upBtn.addEventListener("click", () => {
    if (index === 0) return;
    const [moved] = METRICS_DRAFT.splice(index, 1);
    METRICS_DRAFT.splice(index - 1, 0, moved);
    renderMetricsRows();
    markFormDirty();
  });

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "btn btn-ghost-light btn-sm";
  downBtn.textContent = "↓";
  downBtn.setAttribute("aria-label", "Mover indicador para baixo");
  downBtn.disabled = index === METRICS_DRAFT.length - 1;
  downBtn.addEventListener("click", () => {
    if (index === METRICS_DRAFT.length - 1) return;
    const [moved] = METRICS_DRAFT.splice(index, 1);
    METRICS_DRAFT.splice(index + 1, 0, moved);
    renderMetricsRows();
    markFormDirty();
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-ghost-light btn-sm";
  removeBtn.textContent = "✕";
  removeBtn.setAttribute("aria-label", "Remover indicador");
  removeBtn.addEventListener("click", () => {
    METRICS_DRAFT.splice(index, 1);
    renderMetricsRows();
    markFormDirty();
  });

  actions.appendChild(upBtn);
  actions.appendChild(downBtn);
  actions.appendChild(removeBtn);
  row.appendChild(actions);

  return row;
}

function renderMetricsRows() {
  const list = document.getElementById("s-metrics-list");
  list.innerHTML = "";
  if (METRICS_DRAFT.length === 0) {
    const empty = document.createElement("p");
    empty.className = "admin-empty";
    empty.textContent = "Nenhum indicador — o site mostra os 4 padrões.";
    list.appendChild(empty);
  } else {
    METRICS_DRAFT.forEach((item, index) => list.appendChild(buildMetricRow(item, index)));
  }
  document.getElementById("s-metrics-add").disabled = METRICS_DRAFT.length >= METRICS_MAX;
  setStatus(document.getElementById("s-metrics-status"), "", "");
}

function handleMetricAdd() {
  if (METRICS_DRAFT.length >= METRICS_MAX) return;
  METRICS_DRAFT.push({ value: 0, prefix: "", suffix: "", label: { pt: "", en: "" }, visible: true });
  renderMetricsRows();
  markFormDirty();
}

function handleMetricsRestore() {
  METRICS_DRAFT = cloneMetrics(DEFAULT_METRICS);
  renderMetricsRows();
  markFormDirty();
}

/* Validates METRICS_DRAFT against the same rules as
   scripts/lib/site-settings.mjs's filterMetrics()/js/motion.js's
   filterMetrics(), returning a clean array to save or null (+ a status
   message already shown) on the first violation. */
function validateMetricsDraft() {
  const statusEl = document.getElementById("s-metrics-status");
  if (METRICS_DRAFT.length > METRICS_MAX) {
    setStatus(statusEl, `Máximo de ${METRICS_MAX} indicadores.`, "err");
    return null;
  }
  const cleaned = [];
  for (let i = 0; i < METRICS_DRAFT.length; i++) {
    const item = METRICS_DRAFT[i];
    const n = i + 1;
    const value = Math.trunc(Number(item.value));
    if (!Number.isInteger(value) || value < 0 || value > METRIC_VALUE_MAX) {
      setStatus(statusEl, `Indicador ${n}: o valor precisa ser um número inteiro entre 0 e ${METRIC_VALUE_MAX}.`, "err");
      return null;
    }
    const prefix = item.prefix || "";
    const suffix = item.suffix || "";
    if (!METRIC_AFFIX_PATTERN.test(prefix)) {
      setStatus(statusEl, `Indicador ${n}: prefixo inválido (até 3 caracteres, só ~ + % x k M h).`, "err");
      return null;
    }
    if (!METRIC_AFFIX_PATTERN.test(suffix)) {
      setStatus(statusEl, `Indicador ${n}: sufixo inválido (até 3 caracteres, só ~ + % x k M h).`, "err");
      return null;
    }
    const labelPt = ((item.label && item.label.pt) || "").trim();
    const labelEn = ((item.label && item.label.en) || "").trim();
    if (labelPt.length > METRIC_LABEL_MAX) {
      setStatus(statusEl, `Indicador ${n}: rótulo (PT) passou do limite de ${METRIC_LABEL_MAX} caracteres.`, "err");
      return null;
    }
    if (labelEn.length > METRIC_LABEL_MAX) {
      setStatus(statusEl, `Indicador ${n}: rótulo (EN) passou do limite de ${METRIC_LABEL_MAX} caracteres.`, "err");
      return null;
    }
    cleaned.push({ value, prefix, suffix, label: { pt: labelPt, en: labelEn }, visible: item.visible !== false });
  }
  setStatus(statusEl, "", "");
  return cleaned;
}

async function loadSiteSettings() {
  const statusEl = document.getElementById("site-status");
  setStatus(statusEl, "Carregando configurações…", "");

  const { data, error } = await supabaseClient
    .from("portfolio_site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    setStatus(statusEl, `Não foi possível carregar as configurações: ${error.message}`, "err");
    return;
  }

  SITE_SETTINGS = {
    photoPath: (data && data.photo_path) || "",
    links: (data && data.links) || {},
    i18nOverrides: (data && data.i18n_overrides) || { pt: {}, en: {} },
    metrics: (data && data.metrics) || [],
  };
  setStatus(statusEl, "", "");
  populateSiteForm();
}

async function handlePhotoUpload(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  const statusEl = document.getElementById("s-photo-status");

  if (!SITE_PHOTO_ALLOWED_TYPES.includes(file.type)) {
    setStatus(statusEl, "Formato não aceito. Use JPG, PNG ou WEBP.", "err");
    return;
  }
  if (file.size > SITE_PHOTO_MAX_BYTES) {
    setStatus(statusEl, "Imagem muito grande. O limite é 2 MB.", "err");
    return;
  }

  setStatus(statusEl, "Enviando foto…", "");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `site/profile.${ext}`;

  const { error } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    setStatus(statusEl, `Erro ao enviar a foto: ${error.message}`, "err");
    return;
  }

  PENDING_PHOTO_PATH = path;
  const preview = document.getElementById("s-photo-preview");
  preview.src = `${photoPublicUrl(path)}?v=${Date.now()}`;
  preview.style.display = "inline-block";
  setStatus(statusEl, "Foto enviada! Clique em Salvar para aplicar.", "ok");
  markFormDirty();
}

function handlePhotoReset() {
  PENDING_PHOTO_PATH = "";
  const preview = document.getElementById("s-photo-preview");
  preview.removeAttribute("src");
  preview.style.display = "none";
  setStatus(document.getElementById("s-photo-status"), "Foto será removida ao salvar.", "");
  markFormDirty();
}

function handleFieldRestore(e) {
  const targetId = e.currentTarget.dataset.restore;
  const el = document.getElementById(targetId);
  if (el) el.value = "";
  markFormDirty();
}

async function handleSiteFormSubmit(e) {
  e.preventDefault();
  const statusEl = document.getElementById("site-form-status");

  const links = {};
  for (const key of SITE_SETTINGS_LINK_KEYS) {
    const value = document.getElementById(`s-link-${key}`).value.trim();
    if (value && !isHttpsUrlAdmin(value)) {
      setStatus(statusEl, `O link de ${key} precisa começar com https://.`, "err");
      return;
    }
    if (value) links[key] = value;
  }

  const i18nOverrides = { pt: {}, en: {} };
  for (const key of SITE_SETTINGS_TEXT_KEYS) {
    for (const lang of ["pt", "en"]) {
      const input = document.getElementById(`s-${key}-${lang}`);
      const value = input.value.trim();
      const limit = Number(input.getAttribute("maxlength")) || 300;
      if (value.length > limit) {
        setStatus(statusEl, `O campo "${key}" (${lang.toUpperCase()}) passou do limite de ${limit} caracteres.`, "err");
        return;
      }
      if (value) i18nOverrides[lang][key] = value;
    }
  }

  const metrics = validateMetricsDraft();
  if (metrics === null) return; // validateMetricsDraft() already set the error status

  const photoPath = PENDING_PHOTO_PATH === null ? SITE_SETTINGS.photoPath : PENDING_PHOTO_PATH;

  setStatus(statusEl, "Salvando…", "");
  const { error } = await supabaseClient
    .from("portfolio_site_settings")
    .update({ photo_path: photoPath, links, i18n_overrides: i18nOverrides, metrics })
    .eq("id", 1);

  if (error) {
    setStatus(statusEl, `Erro ao salvar: ${error.message}`, "err");
    return;
  }

  clearFormDirty();
  setStatus(statusEl, "Salvo! O site já reflete a mudança.", "ok");
  await loadSiteSettings();
}

function bindSiteSettingsEvents() {
  document.getElementById("btn-tab-projects").addEventListener("click", showProjectsTab);
  document.getElementById("btn-tab-site").addEventListener("click", () => {
    showSiteTab();
    loadSiteSettings();
  });
  document.getElementById("s-photo-upload").addEventListener("change", handlePhotoUpload);
  document.getElementById("s-photo-reset").addEventListener("click", handlePhotoReset);
  document.getElementById("s-metrics-add").addEventListener("click", handleMetricAdd);
  document.getElementById("s-metrics-restore").addEventListener("click", handleMetricsRestore);
  document.getElementById("site-settings-form").addEventListener("submit", handleSiteFormSubmit);
  document.getElementById("site-settings-form").addEventListener("input", markFormDirty);
  document.getElementById("site-settings-form").addEventListener("change", markFormDirty);
  document.querySelectorAll("#admin-site-section [data-restore]").forEach((btn) => {
    btn.addEventListener("click", handleFieldRestore);
  });
}

async function handleLoginClick() {
  const statusEl = document.getElementById("login-status");
  try {
    setStatus(statusEl, "Redirecionando pro GitHub…", "");
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo },
    });
    if (error) setStatus(statusEl, `Erro ao iniciar login: ${error.message}`, "err");
  } catch (err) {
    setStatus(statusEl, `Erro inesperado ao iniciar login: ${err.message}`, "err");
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
}

function bindEvents() {
  document.getElementById("btn-login-github").addEventListener("click", handleLoginClick);
  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("btn-logout-forbidden").addEventListener("click", logout);
  document.getElementById("btn-new").addEventListener("click", () => openForm(null));
  document.getElementById("btn-cancel").addEventListener("click", () => {
    clearFormDirty();
    showPanelSection();
  });
  document.getElementById("project-form").addEventListener("submit", handleFormSubmit);
  document.getElementById("f-cardImage-upload").addEventListener("change", handleCardImageUpload);
  document.getElementById("f-screenshot-upload").addEventListener("change", handleScreenshotUpload);
  document.getElementById("project-form").addEventListener("input", markFormDirty);
  document.getElementById("project-form").addEventListener("change", markFormDirty);
  bindSiteSettingsEvents();
}

async function init() {
  const loginStatus = document.getElementById("login-status");
  try {
    if (typeof window.supabase === "undefined" || typeof window.supabase.createClient !== "function") {
      setStatus(
        loginStatus,
        "Não foi possível carregar a biblioteca do Supabase. Verifique sua conexão e recarregue a página.",
        "err"
      );
      return;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    bindEvents();
    supabaseClient.auth.onAuthStateChange((event, session) => {
      handleAuthStateChange(event, session);
    });
    await checkAuthAndRoute();
  } catch (err) {
    setStatus(loginStatus, `Erro inesperado ao carregar a página: ${err.message}`, "err");
  }
}

document.addEventListener("DOMContentLoaded", init);
