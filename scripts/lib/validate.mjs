export class BuildValidationError extends Error {}

export function isValidUrl(value) {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value.trim());
}

export function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  return /^https:\/\//i.test(value.trim());
}

/* A CV/resume link: either an https:// URL, or a path the admin uploaded
   under /cv/ in this repo. Mirrored in js/admin.js (browser classic
   script, can't import this Node module). */
export function isValidCvValue(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  if (isHttpsUrl(v)) return true;
  return v.startsWith("/cv/");
}

/* Project category: used for the home page filter and the card/page badge.
   Mirrored by hand in js/main.js, js/project.js, js/admin.js (browser
   classic scripts) and in the portfolio_projects.category CHECK
   constraint — keep all four in sync if a category is ever added. */
export const CATEGORY_VALUES = ["data-bi", "automation", "apps"];

export function isValidCategory(value) {
  return typeof value === "string" && CATEGORY_VALUES.includes(value);
}

/* Power BI embeds must be https:// on app.powerbi.com exactly — same rule
   as portfolio_projects.powerbi_url's CHECK constraint and the admin
   form's client-side validation (mirrored there, Node can't be imported
   from that browser classic script). */
export function isValidPowerBiUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname === "app.powerbi.com";
  } catch (e) {
    return false;
  }
}

/* case_study.metrics: up to 3 headline numbers for the case-study page's
   dark result strip. Each needs a non-empty value, a label in at least one
   language, and a kind flagging whether it's measured or estimated — never
   rendered unlabeled. Mirrored in js/admin.js (browser classic script). */
export const CASE_STUDY_METRIC_KIND_VALUES = ["measured", "estimated"];
export const CASE_STUDY_METRICS_MAX = 3;

function isValidCaseStudyMetric(metric) {
  if (!metric || typeof metric !== "object") return false;
  if (typeof metric.value !== "string" || !metric.value.trim()) return false;
  if (!metric.label || typeof metric.label !== "object") return false;
  const pt = typeof metric.label.pt === "string" ? metric.label.pt.trim() : "";
  const en = typeof metric.label.en === "string" ? metric.label.en.trim() : "";
  if (!pt && !en) return false;
  if (!CASE_STUDY_METRIC_KIND_VALUES.includes(metric.kind)) return false;
  return true;
}

/* null/undefined (no metrics set) is valid — metrics are optional. */
export function isValidCaseStudyMetrics(metrics) {
  if (metrics == null) return true;
  if (!Array.isArray(metrics)) return false;
  if (metrics.length > CASE_STUDY_METRICS_MAX) return false;
  return metrics.every(isValidCaseStudyMetric);
}

export function validateProject(project, context) {
  const errors = [];

  if (!project || typeof project !== "object") {
    throw new BuildValidationError(`Projeto inválido (${context}): não é um objeto.`);
  }
  if (!project.slug || typeof project.slug !== "string" || !project.slug.trim()) {
    errors.push("slug ausente ou vazio");
  }
  if (!project.title || typeof project.title !== "string" || !project.title.trim()) {
    errors.push("title ausente ou vazio");
  }
  if (!project.description || typeof project.description.pt !== "string" || !project.description.pt.trim()) {
    errors.push("description.pt ausente ou vazio");
  }
  if (!Array.isArray(project.stack)) {
    errors.push("stack ausente ou não é um array");
  }
  if (project.category != null && !isValidCategory(project.category)) {
    errors.push(`category inválida: "${project.category}" (esperado data-bi, automation ou apps)`);
  }
  if (project.powerbiUrl && !isValidPowerBiUrl(project.powerbiUrl)) {
    errors.push(`powerbiUrl inválida: "${project.powerbiUrl}" (precisa ser https://app.powerbi.com/...)`);
  }
  if (project.caseStudy && !isValidCaseStudyMetrics(project.caseStudy.metrics)) {
    errors.push(
      `case_study.metrics inválido (máx ${CASE_STUDY_METRICS_MAX} itens, cada um com value, label.pt/en e kind "measured" ou "estimated")`
    );
  }

  if (errors.length) {
    throw new BuildValidationError(
      `Projeto inválido (${context}, slug="${project.slug || "?"}"): ${errors.join("; ")}`
    );
  }
}
