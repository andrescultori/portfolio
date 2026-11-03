export class BuildValidationError extends Error {}

export function isValidUrl(value) {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value.trim());
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

  if (errors.length) {
    throw new BuildValidationError(
      `Projeto inválido (${context}, slug="${project.slug || "?"}"): ${errors.join("; ")}`
    );
  }
}
