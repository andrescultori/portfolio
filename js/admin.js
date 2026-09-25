/* Admin panel: edits data/projects.json directly via the GitHub Contents API,
   authenticated with a fine-grained Personal Access Token the user pastes in.
   The token only ever lives in this browser's localStorage and is sent straight
   to api.github.com — no third-party server is involved. */

const PAT_KEY = "gh_pat";
const REPO_OWNER = "andrescultori";
const REPO_NAME = "portfolio";
const FILE_PATH = "data/projects.json";
const API_BASE = "https://api.github.com";

let TOKEN = null;
let PROJECTS = [];
let FILE_SHA = null;
let EDITING_INDEX = null; // null = creating a new project

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function b64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function setStatus(el, text, type) {
  if (!el) return;
  el.className = "form-status" + (type ? ` ${type}` : "");
  el.textContent = text;
}

function showLogin() {
  document.getElementById("admin-login").style.display = "block";
  document.getElementById("admin-panel").style.display = "none";
  document.getElementById("admin-form-section").style.display = "none";
  document.getElementById("btn-logout").style.display = "none";
}

function showPanel() {
  document.getElementById("admin-login").style.display = "none";
  document.getElementById("admin-panel").style.display = "block";
  document.getElementById("admin-form-section").style.display = "none";
  document.getElementById("btn-logout").style.display = "inline-flex";
}

function showFormSection() {
  document.getElementById("admin-panel").style.display = "none";
  document.getElementById("admin-form-section").style.display = "block";
}

function hideFormSection() {
  document.getElementById("admin-form-section").style.display = "none";
  document.getElementById("admin-panel").style.display = "block";
}

async function validateToken(token) {
  try {
    const res = await fetch(`${API_BASE}/user`, { headers: ghHeaders(token) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function loadProjects() {
  const panelStatus = document.getElementById("panel-status");
  setStatus(panelStatus, "Carregando projetos…", "");
  try {
    const res = await fetch(
      `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      { headers: ghHeaders(TOKEN), cache: "no-store" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    FILE_SHA = data.sha;
    PROJECTS = JSON.parse(b64ToUtf8(data.content));
    setStatus(panelStatus, "", "");
    renderTable();
  } catch (err) {
    setStatus(panelStatus, `Não foi possível carregar data/projects.json (${err.message}).`, "err");
  }
}

function renderTable() {
  const tbody = document.getElementById("projects-tbody");
  tbody.innerHTML = "";

  if (PROJECTS.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="admin-empty">Nenhum projeto cadastrado ainda.</td>`;
    tbody.appendChild(tr);
    return;
  }

  const rows = PROJECTS.map((p, i) => ({ p, i })).sort(
    (a, b) => (a.p.sortOrder || 0) - (b.p.sortOrder || 0)
  );

  rows.forEach(({ p, i }) => {
    const badges = [];
    if (p.featured) badges.push("Destaque");
    if (p.commercial) badges.push("Comercial");
    if (p.draft) badges.push("Rascunho");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.sortOrder ?? "")}</td>
      <td>${escapeHtml(p.title)}</td>
      <td>${escapeHtml(p.slug)}</td>
      <td>${badges.map((b) => `<span class="admin-badge">${b}</span>`).join(" ") || "—"}</td>
      <td class="admin-row-actions">
        <button type="button" class="btn btn-ghost-light btn-sm" data-action="edit" data-index="${i}">Editar</button>
        <button type="button" class="btn btn-ghost-light btn-sm" data-action="delete" data-index="${i}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (btn.dataset.action === "edit") openForm(idx);
      else deleteProject(idx);
    });
  });
}

function nextSortOrder() {
  if (PROJECTS.length === 0) return 0;
  return Math.max(...PROJECTS.map((p) => p.sortOrder || 0)) + 1;
}

function openForm(index) {
  EDITING_INDEX = index;
  const p = index === null ? null : PROJECTS[index];
  const form = document.getElementById("project-form");
  form.reset();
  setStatus(document.getElementById("form-status-msg"), "", "");

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

async function saveProjects(commitMessage, statusEl) {
  setStatus(statusEl, "Salvando…", "");
  try {
    const body = {
      message: commitMessage,
      content: utf8ToB64(JSON.stringify(PROJECTS, null, 2) + "\n"),
      sha: FILE_SHA,
    };
    const res = await fetch(
      `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        method: "PUT",
        headers: { ...ghHeaders(TOKEN), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (res.status === 409) {
      setStatus(
        statusEl,
        "Conflito: o arquivo foi alterado por outra sessão. Recarregue a página antes de tentar de novo.",
        "err"
      );
      return false;
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      setStatus(statusEl, `Erro ao salvar (HTTP ${res.status}): ${errData.message || "tente novamente."}`, "err");
      return false;
    }

    const data = await res.json();
    FILE_SHA = data.content.sha;
    setStatus(statusEl, "Salvo! O GitHub Pages deve atualizar em ~1 minuto.", "ok");
    renderTable();
    return true;
  } catch (err) {
    setStatus(statusEl, `Erro de rede ao salvar: ${err.message}`, "err");
    return false;
  }
}

function deleteProject(index) {
  const p = PROJECTS[index];
  if (!p) return;
  const ok = window.confirm(`Excluir o projeto "${p.title}"? Isso envia um commit direto para o GitHub.`);
  if (!ok) return;

  PROJECTS.splice(index, 1);
  saveProjects(`admin: remove projeto "${p.slug}" via painel`, document.getElementById("panel-status"));
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const statusEl = document.getElementById("form-status-msg");

  const slug = document.getElementById("f-slug").value.trim();
  const title = document.getElementById("f-title").value.trim();

  if (!slug) return setStatus(statusEl, "Slug é obrigatório.", "err");
  if (!title) return setStatus(statusEl, "Título é obrigatório.", "err");

  const isDuplicate = PROJECTS.some((p, i) => p.slug === slug && i !== EDITING_INDEX);
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
    commercial: document.getElementById("f-commercial").checked,
    featured: document.getElementById("f-featured").checked,
    sortOrder: sortOrderRaw === "" ? 0 : Number(sortOrderRaw),
  };
  if (live) project.links.live = live;
  if (github) project.links.github = github;
  if (notePt || noteEn) {
    project.note = {};
    if (notePt) project.note.pt = notePt;
    if (noteEn) project.note.en = noteEn;
  }
  if (document.getElementById("f-draft").checked) project.draft = true;

  if (EDITING_INDEX === null) {
    PROJECTS.push(project);
  } else {
    PROJECTS[EDITING_INDEX] = project;
  }

  const commitMessage =
    EDITING_INDEX === null
      ? `admin: adiciona projeto "${slug}" via painel`
      : `admin: atualiza data/projects.json via painel (${slug})`;

  const ok = await saveProjects(commitMessage, statusEl);
  if (ok) setTimeout(hideFormSection, 900);
}

function bindEvents() {
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("pat");
    const statusEl = document.getElementById("login-status");
    const value = input.value.trim();
    if (!value) return;

    setStatus(statusEl, "Verificando token…", "");
    const ok = await validateToken(value);
    if (ok) {
      TOKEN = value;
      localStorage.setItem(PAT_KEY, value);
      input.value = "";
      setStatus(statusEl, "", "");
      showPanel();
      await loadProjects();
    } else {
      setStatus(statusEl, "Token inválido, expirado ou sem acesso ao repositório.", "err");
    }
  });

  document.getElementById("btn-logout").addEventListener("click", () => {
    localStorage.removeItem(PAT_KEY);
    TOKEN = null;
    PROJECTS = [];
    FILE_SHA = null;
    showLogin();
  });

  document.getElementById("btn-new").addEventListener("click", () => openForm(null));
  document.getElementById("btn-cancel").addEventListener("click", hideFormSection);
  document.getElementById("project-form").addEventListener("submit", handleFormSubmit);
}

async function init() {
  bindEvents();
  TOKEN = localStorage.getItem(PAT_KEY);
  if (!TOKEN) {
    showLogin();
    return;
  }
  const ok = await validateToken(TOKEN);
  if (!ok) {
    localStorage.removeItem(PAT_KEY);
    TOKEN = null;
    showLogin();
    return;
  }
  showPanel();
  await loadProjects();
}

document.addEventListener("DOMContentLoaded", init);
