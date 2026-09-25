/* Home page: loads data/projects.json, renders hero-driven stack filter and the project grid. */

let ALL_PROJECTS = [];
let ACTIVE_STACK = null;

function iconSvg(name) {
  const icons = {
    github:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.73.5.98 5.24.98 11.5c0 4.98 3.23 9.2 7.71 10.69.56.1.77-.24.77-.54 0-.27-.01-1.16-.02-2.1-3.14.68-3.8-1.34-3.8-1.34-.51-1.31-1.25-1.66-1.25-1.66-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.51-.29-5.15-1.26-5.15-5.6 0-1.24.44-2.25 1.16-3.04-.12-.29-.5-1.45.11-3.02 0 0 .95-.3 3.12 1.16a10.8 10.8 0 0 1 5.68 0c2.16-1.46 3.11-1.16 3.11-1.16.62 1.57.23 2.73.11 3.02.73.79 1.16 1.8 1.16 3.04 0 4.35-2.65 5.31-5.17 5.59.4.35.76 1.03.76 2.08 0 1.5-.01 2.71-.01 3.08 0 .3.2.65.78.54A10.52 10.52 0 0 0 23.02 11.5C23.02 5.24 18.27.5 12 .5Z"/></svg>',
    external:
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>',
  };
  return icons[name] || "";
}

function renderStackFilter(projects) {
  const counts = new Map();
  projects.forEach((p) => p.stack.forEach((tech) => counts.set(tech, (counts.get(tech) || 0) + 1)));
  const stacks = Array.from(counts, ([tech, count]) => ({ tech, count })).sort(
    (a, b) => b.count - a.count || a.tech.localeCompare(b.tech)
  );

  const wrap = document.getElementById("stack-filter");
  wrap.innerHTML = "";

  const allChip = document.createElement("button");
  allChip.className = "chip" + (ACTIVE_STACK === null ? " is-active" : "");
  allChip.type = "button";
  allChip.textContent = t("filter_all");
  allChip.addEventListener("click", () => {
    ACTIVE_STACK = null;
    render();
  });
  wrap.appendChild(allChip);

  stacks.forEach(({ tech, count }) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (ACTIVE_STACK === tech ? " is-active" : "");
    chip.type = "button";
    chip.innerHTML = `<span>${escapeHtml(tech)}</span><span class="chip-count">${count}</span>`;
    chip.addEventListener("click", () => {
      ACTIVE_STACK = ACTIVE_STACK === tech ? null : tech;
      render();
    });
    wrap.appendChild(chip);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function projectCard(project) {
  const lang = getLang();
  const desc = project.description[lang] || project.description.pt || "";
  const detailHref = `projeto.html?slug=${encodeURIComponent(project.slug)}`;

  const card = document.createElement("article");
  card.className = "card";

  const mediaLink = document.createElement("a");
  mediaLink.className = "card-media-link";
  mediaLink.href = detailHref;
  mediaLink.setAttribute("aria-label", project.title);

  const media = document.createElement("div");
  media.className = "card-media";
  const img = document.createElement("img");
  img.src = project.cardImage;
  img.alt = project.title;
  img.loading = "lazy";
  media.appendChild(img);
  if (project.commercial) {
    const badge = document.createElement("span");
    badge.className = "badge-commercial";
    badge.textContent = t("badge_commercial");
    media.appendChild(badge);
  }
  mediaLink.appendChild(media);

  const body = document.createElement("div");
  body.className = "card-body";
  body.innerHTML = `
    <a class="card-title-link" href="${detailHref}"><h3>${escapeHtml(project.title)}</h3></a>
    <p>${escapeHtml(desc)}</p>
    <div class="tag-row">
      ${project.stack.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("")}
    </div>
    <div class="card-links">
      ${
        project.links.live
          ? `<a href="${project.links.live}" target="_blank" rel="noopener">${iconSvg("external")} ${t("link_live")}</a>`
          : ""
      }
      ${
        project.links.github
          ? `<a href="${project.links.github}" target="_blank" rel="noopener">${iconSvg("github")} ${t("link_github")}</a>`
          : ""
      }
      <a class="card-more-link" href="${detailHref}">${t("link_more")} &rarr;</a>
    </div>
  `;

  card.appendChild(mediaLink);
  card.appendChild(body);
  return card;
}

function render() {
  renderStackFilter(ALL_PROJECTS);

  const visible =
    ACTIVE_STACK === null ? ALL_PROJECTS : ALL_PROJECTS.filter((p) => p.stack.includes(ACTIVE_STACK));

  const status = document.getElementById("filter-status");
  if (ACTIVE_STACK !== null) {
    status.style.display = "block";
    status.innerHTML = `${t("filter_showing")} <strong>${escapeHtml(ACTIVE_STACK)}</strong>.
      <button type="button" id="clear-filter">${t("filter_clear")}</button>`;
    document.getElementById("clear-filter").addEventListener("click", () => {
      ACTIVE_STACK = null;
      render();
    });
  } else {
    status.style.display = "none";
    status.innerHTML = "";
  }

  const grid = document.getElementById("project-grid");
  const empty = document.getElementById("empty-state");
  grid.innerHTML = "";

  if (visible.length === 0) {
    grid.style.display = "none";
    empty.style.display = "block";
    empty.textContent = ACTIVE_STACK === null ? t("empty_all") : `${t("empty_filtered")} ${ACTIVE_STACK}.`;
  } else {
    grid.style.display = "grid";
    empty.style.display = "none";
    visible.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    visible.forEach((p) => grid.appendChild(projectCard(p)));
  }
}

async function init() {
  initLangToggle(() => render());
  try {
    const res = await fetch("data/projects.json", { cache: "no-store" });
    const data = await res.json();
    ALL_PROJECTS = data.filter((p) => !p.draft);
  } catch (e) {
    ALL_PROJECTS = [];
  }
  render();
}

document.addEventListener("DOMContentLoaded", init);
