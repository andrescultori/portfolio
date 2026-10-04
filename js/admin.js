/* Admin panel: edits portfolio_projects in Supabase, authenticated via
   GitHub OAuth (Supabase Auth). Row Level Security only allows writes from
   GitHub accounts listed in portfolio_admins — this client-side check is
   just for a nicer UI, the real enforcement lives in Postgres. */

let supabaseClient = null;
const STORAGE_BUCKET = "portfolio-images";

let PROJECTS = [];
let EDITING_SLUG = null; // null = creating a new project

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
  document.getElementById("admin-panel").style.display = state === "authorized" ? "block" : "none";
  document.getElementById("admin-form-section").style.display = "none";
  document.getElementById("btn-logout").style.display = state === "login" ? "none" : "inline-flex";
}

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
      showAuthState("login");
      return;
    }
    const { data: isAdmin, error } = await supabaseClient.rpc("is_portfolio_admin");
    if (error || !isAdmin) {
      showAuthState("forbidden");
      return;
    }
    showAuthState("authorized");
    await loadProjects();
  } catch (err) {
    showAuthState("login");
    setStatus(document.getElementById("login-status"), `Erro ao verificar sessão: ${err.message}`, "err");
  }
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
    card.innerHTML = `
      <div class="admin-project-card-head">
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
  document.getElementById("f-sortOrder").value = p ? p.sortOrder ?? 0 : nextSortOrder();
  document.getElementById("f-commercial").checked = !!(p && p.commercial);
  document.getElementById("f-featured").checked = !!(p && p.featured);
  document.getElementById("f-draft").checked = !!(p && p.draft);

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
  const sortOrderRaw = document.getElementById("f-sortOrder").value;

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
    sortOrder: sortOrderRaw === "" ? 0 : Number(sortOrderRaw),
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
  document.getElementById("btn-cancel").addEventListener("click", showPanelSection);
  document.getElementById("project-form").addEventListener("submit", handleFormSubmit);
  document.getElementById("f-cardImage-upload").addEventListener("change", handleCardImageUpload);
  document.getElementById("f-screenshot-upload").addEventListener("change", handleScreenshotUpload);
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
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        checkAuthAndRoute();
      }
    });
    await checkAuthAndRoute();
  } catch (err) {
    setStatus(loginStatus, `Erro inesperado ao carregar a página: ${err.message}`, "err");
  }
}

document.addEventListener("DOMContentLoaded", init);
