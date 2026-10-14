export class BuildValidationError extends Error {}

export function isValidUrl(value) {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value.trim());
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

  if (errors.length) {
    throw new BuildValidationError(
      `Projeto inválido (${context}, slug="${project.slug || "?"}"): ${errors.join("; ")}`
    );
  }
}
