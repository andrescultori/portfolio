/* Project detail page: reads ?slug= from the URL, finds it in data/projects.json, renders it. */

function iconSvgP(name) {
  const icons = {
    github:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.73.5.98 5.24.98 11.5c0 4.98 3.23 9.2 7.71 10.69.56.1.77-.24.77-.54 0-.27-.01-1.16-.02-2.1-3.14.68-3.8-1.34-3.8-1.34-.51-1.31-1.25-1.66-1.25-1.66-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.51-.29-5.15-1.26-5.15-5.6 0-1.24.44-2.25 1.16-3.04-.12-.29-.5-1.45.11-3.02 0 0 .95-.3 3.12 1.16a10.8 10.8 0 0 1 5.68 0c2.16-1.46 3.11-1.16 3.11-1.16.62 1.57.23 2.73.11 3.02.73.79 1.16 1.8 1.16 3.04 0 4.35-2.65 5.31-5.17 5.59.4.35.76 1.03.76 2.08 0 1.5-.01 2.71-.01 3.08 0 .3.2.65.78.54A10.52 10.52 0 0 0 23.02 11.5C23.02 5.24 18.27.5 12 .5Z"/></svg>',
    external:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>',
  };
  return icons[name] || "";
}

function escapeHtmlP(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderProject(project) {
  const lang = getLang();
  const desc = project.description[lang] || project.description.pt || "";

  document.title = `${project.title} — André Scultori`;

  document.getElementById("project-title").textContent = project.title;

  const tagRow = document.getElementById("project-tags");
  tagRow.innerHTML = project.stack.map((s) => `<span class="tag">${escapeHtmlP(s)}</span>`).join("");

  const actions = document.getElementById("project-actions");
  actions.innerHTML = "";
  if (project.links.live) {
    const a = document.createElement("a");
    a.href = project.links.live;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "btn btn-primary btn-sm";
    a.innerHTML = `${iconSvgP("external")} ${t("link_live")}`;
    actions.appendChild(a);
  }
  if (project.links.github) {
    const a = document.createElement("a");
    a.href = project.links.github;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "btn btn-ghost-dark btn-sm";
    a.innerHTML = `${iconSvgP("github")} ${t("link_github")}`;
    actions.appendChild(a);
  }

  const cover = document.getElementById("project-cover");
  if (project.cardImage) {
    cover.style.display = "";
    cover.innerHTML = `<img src="${project.cardImage}" alt="${escapeHtmlP(project.title)}">`;
  } else {
    cover.style.display = "none";
    cover.innerHTML = "";
  }

  document.getElementById("project-description").textContent = desc;

  const noteEl = document.getElementById("project-note");
  if (project.note && (project.note[lang] || project.note.pt)) {
    noteEl.style.display = "inline-block";
    noteEl.textContent = project.note[lang] || project.note.pt;
  } else {
    noteEl.style.display = "none";
  }

  const shotSection = document.getElementById("screenshots-section");
  const shotGrid = document.getElementById("shot-grid");
  shotGrid.innerHTML = "";
  if (project.screenshots && project.screenshots.length > 0) {
    shotSection.style.display = "block";
    project.screenshots.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = project.title;
      img.loading = "lazy";
      img.addEventListener("click", () => openLightbox(src));
      shotGrid.appendChild(img);
    });
  } else {
    shotSection.style.display = "none";
  }

  document.getElementById("side-stack").innerHTML = project.stack
    .map((s) => `<span class="tag">${escapeHtmlP(s)}</span>`)
    .join("");

  const sideLinks = document.getElementById("side-links");
  sideLinks.innerHTML = "";
  if (project.links.live) {
    sideLinks.innerHTML += `<a class="btn btn-ghost-light btn-sm" href="${project.links.live}" target="_blank" rel="noopener">${iconSvgP(
      "external"
    )} ${t("link_live")}</a>`;
  }
  if (project.links.github) {
    sideLinks.innerHTML += `<a class="btn btn-ghost-light btn-sm" href="${project.links.github}" target="_blank" rel="noopener">${iconSvgP(
      "github"
    )} ${t("link_github")}</a>`;
  }
}

function openLightbox(src) {
  const box = document.getElementById("lightbox");
  document.getElementById("lightbox-img").src = src;
  box.classList.add("is-open");
}

function closeLightbox() {
  document.getElementById("lightbox").classList.remove("is-open");
}

let CURRENT_PROJECT = null;

async function initProjectPage() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");

  initLangToggle(() => {
    if (CURRENT_PROJECT) renderProject(CURRENT_PROJECT);
  });

  try {
    const res = await fetch("data/projects.json", { cache: "no-store" });
    const data = await res.json();
    CURRENT_PROJECT = data.find((p) => p.slug === slug && !p.draft);
  } catch (e) {
    CURRENT_PROJECT = null;
  }

  if (!CURRENT_PROJECT) {
    document.getElementById("project-app").innerHTML =
      '<div class="wrap" style="padding:80px 24px;"><p>Projeto não encontrado.</p><a href="index.html">Voltar</a></div>';
    return;
  }

  renderProject(CURRENT_PROJECT);

  document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
  document.getElementById("lightbox").addEventListener("click", (e) => {
    if (e.target.id === "lightbox") closeLightbox();
  });
}

document.addEventListener("DOMContentLoaded", initProjectPage);
