import { escapeHtml } from "./html.mjs";

/* Static (PT) SVG figures for specific project slugs, used by
   render-project-page.mjs. The equivalent is duplicated by hand inside
   js/project.js (browser classic script, can't import this Node module) —
   same mirrored-duplication pattern already used across this codebase. Both
   sides must stay in sync: same slugs, same markup shape, same element ids
   used as CSS/JS animation hooks ("figure-pulse-path", "figure-bar"). Any
   slug not listed here renders no figure at all (an empty #project-figure). */

const ICON_LABEL_PT = {
  "processo-seletivo": "Diagrama: Make.com no centro, conectado a Tally, Kommo, ClickUp, Google Sheets e E-mail/Documentos.",
  "dashboard-financeiro": "Ilustração de um mini-gráfico de barras do dashboard financeiro.",
};

function processoSeletivoFigure() {
  const nodes = [
    { label: "Tally", x: 70, y: 40 },
    { label: "Kommo", x: 230, y: 40 },
    { label: "ClickUp", x: 260, y: 140 },
    { label: "Google Sheets", x: 150, y: 190 },
    { label: "E-mail/Documentos", x: 40, y: 140 },
  ];
  const cx = 150;
  const cy = 100;

  const lines = nodes
    .map(
      (n, i) =>
        `<line class="figure-pulse-path" style="animation-delay:${i * 0.6}s" x1="${cx}" y1="${cy}" x2="${n.x}" y2="${n.y}"/>`
    )
    .join("\n      ");

  const satellites = nodes
    .map(
      (n) => `<g>
        <circle cx="${n.x}" cy="${n.y}" r="20" class="figure-node"/>
        <text x="${n.x}" y="${n.y + 34}" class="figure-node-label" text-anchor="middle">${escapeHtml(n.label)}</text>
      </g>`
    )
    .join("\n      ");

  return `<svg class="figure-svg figure-star" viewBox="0 0 300 220" role="img" aria-label="${escapeHtml(
    ICON_LABEL_PT["processo-seletivo"]
  )}">
    <g class="figure-lines" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 10">
      ${lines}
    </g>
    <circle cx="${cx}" cy="${cy}" r="28" class="figure-node figure-node--center"/>
    <text x="${cx}" y="${cy + 5}" class="figure-node-label figure-node-label--center" text-anchor="middle">Make.com</text>
    ${satellites}
  </svg>`;
}

function dashboardFinanceiroFigure() {
  const bars = [38, 62, 46, 80, 58, 70];
  const barWidth = 26;
  const gap = 12;
  const chartHeight = 100;
  const bodyHtml = bars
    .map((h, i) => {
      const x = i * (barWidth + gap);
      const y = chartHeight - h;
      return `<rect class="figure-bar" style="transition-delay:${i * 0.08}s" x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="3"/>`;
    })
    .join("\n      ");

  const width = bars.length * (barWidth + gap) - gap;

  return `<figure class="figure-wrap">
    <svg class="figure-svg figure-bars" viewBox="0 0 ${width} ${chartHeight}" role="img" aria-label="${escapeHtml(
    ICON_LABEL_PT["dashboard-financeiro"]
  )}">
      ${bodyHtml}
    </svg>
    <p class="figure-caption">Ilustração, dados fictícios.</p>
  </figure>`;
}

const FIGURE_BUILDERS = {
  "processo-seletivo": processoSeletivoFigure,
  "dashboard-financeiro": dashboardFinanceiroFigure,
};

/** Returns the figure's HTML for a project slug, or "" if that slug has none. */
export function renderProjectFigure(slug) {
  const builder = FIGURE_BUILDERS[slug];
  return builder ? builder() : "";
}
