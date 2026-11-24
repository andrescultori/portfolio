import { escapeHtml } from "./html.mjs";
import { assetSrc } from "./public-urls.mjs";

/* Decorative, aria-hidden visuals for the home page's "Selected projects"
   rows (and the hero, which reuses biMockVisualHtml for its own generic
   dashboard graphic). Picking order: a real image (cardImage/screenshots[0])
   always wins; otherwise a small per-slug hand-drawn mock; otherwise a
   neutral dashed placeholder. Every mock is pure CSS/divs — no invented
   numbers in any visible text, only decorative sizing. Bars animate via
   [data-grow] once visible (see js/motion.js + README's Motion section). */

const BI_MOCK_CAPTION = { en: "Demo data", pt: "Dados fictícios" };

export function biMockVisualHtml(lang) {
  const s = BI_MOCK_CAPTION[lang] || BI_MOCK_CAPTION.en;
  const barHeights = [40, 64, 52, 88, 72, 104, 84, 124];
  const bars = barHeights
    .map((h, i) => {
      const accent = i === 5 || i === 7 ? " accent" : "";
      return `<div class="dash-bar${accent}" data-grow style="height:${h}px"></div>`;
    })
    .join("");
  return `<div class="project-visual bi-mock" aria-hidden="true">
      <div class="dash">
        <div class="dash-tiles">
          <div class="dash-tile"><span class="dash-tile-value">R$ •••</span></div>
          <div class="dash-tile"><span class="dash-tile-value">R$ •••</span></div>
          <div class="dash-tile"><span class="dash-tile-value accent">R$ •••</span></div>
        </div>
        <div class="dash-chart">
          <div class="dash-bars" data-grow-stagger="60">${bars}</div>
        </div>
      </div>
      <p class="dash-caption">${escapeHtml(s)}</p>
    </div>`;
}

const FLOW_STEPS = {
  en: ["Form", "Make.com", "CRM + WhatsApp", "Contract PDF"],
  pt: ["Formulário", "Make.com", "CRM + WhatsApp", "PDF do contrato"],
};
const FLOW_STATS = {
  en: ["16 scenarios", "10+ tools", "~80% fewer operations"],
  pt: ["16 cenários", "10+ ferramentas", "~80% menos operações"],
};

function flowVisualHtml(lang) {
  const steps = FLOW_STEPS[lang] || FLOW_STEPS.en;
  const stats = FLOW_STATS[lang] || FLOW_STATS.en;
  const stepsHtml = steps
    .map((step, i) => {
      const arrow = i < steps.length - 1 ? '<span class="cs-pipeline-arrow" aria-hidden="true">→</span>' : "";
      return `<div class="cs-pipeline-step"><span class="k">${String(i + 1).padStart(2, "0")}</span>${escapeHtml(step)}</div>${arrow}`;
    })
    .join("");
  const statsHtml = stats.map((stat) => `<span class="flow-stat">${escapeHtml(stat)}</span>`).join("");
  return `<div class="project-visual flow-visual" aria-hidden="true">
      <div class="cs-pipeline">${stepsHtml}</div>
      <div class="flow-stats">${statsHtml}</div>
    </div>`;
}

const QUOTE_BTN_LABEL = { en: "Send quote", pt: "Enviar orçamento" };

function quoteCardVisualHtml(lang) {
  const label = QUOTE_BTN_LABEL[lang] || QUOTE_BTN_LABEL.en;
  return `<div class="project-visual quote-card-visual" aria-hidden="true">
      <div class="quote-card">
        <div class="quote-card-row"><span class="quote-card-dot"></span><span class="quote-card-line" style="width:70%"></span></div>
        <div class="quote-card-row"><span class="quote-card-dot"></span><span class="quote-card-line" style="width:45%"></span></div>
        <div class="quote-card-total"><span class="quote-card-line" style="width:30%"></span><span class="quote-card-total-value">R$ •••</span></div>
        <span class="quote-card-btn">${escapeHtml(label)}</span>
      </div>
    </div>`;
}

function wireframeVisualHtml() {
  return `<div class="project-visual wireframe-visual" aria-hidden="true">
      <div class="wireframe-nav"><span></span><span></span><span></span></div>
      <div class="wireframe-hero">
        <span class="wireframe-line" style="width:60%"></span>
        <span class="wireframe-line" style="width:40%"></span>
        <span class="wireframe-btn"></span>
      </div>
      <div class="wireframe-grid"><span></span><span></span><span></span></div>
    </div>`;
}

function placeholderVisualHtml() {
  return `<div class="project-visual placeholder-visual" aria-hidden="true"></div>`;
}

const SLUG_VISUALS = {
  "processo-seletivo": flowVisualHtml,
  "dashboard-financeiro": (lang) => biMockVisualHtml(lang),
  "orcamentos-felipe-blaya": quoteCardVisualHtml,
  "agape-multimidia": wireframeVisualHtml,
};

/* Main entry point used by render-home.mjs for each featured project row. */
export function getProjectVisualHtml(lang, project) {
  const image = (project && (project.cardImage || (project.screenshots && project.screenshots[0]))) || "";
  if (image) {
    return `<div class="project-visual project-visual-image" aria-hidden="true"><img src="${escapeHtml(assetSrc(image))}" alt="" loading="lazy"></div>`;
  }
  const builder = project && SLUG_VISUALS[project.slug];
  return builder ? builder(lang) : placeholderVisualHtml();
}
