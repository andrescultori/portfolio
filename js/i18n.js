/* Shared UI strings (PT/EN) + language state helper.
   Project content strings live in data/projects.json (description.pt / description.en). */

const I18N = {
  pt: {
    nav_projects: "Projetos",
    nav_contact: "Contato",
    hero_eyebrow: "Portfólio",
    hero_role: "Analista de BI & Automação de Processos",
    hero_bio:
      "Mais de 15 anos gerindo processos e pessoas, hoje aplicando isso a dados, automação e integração de sistemas.",
    hero_linkedin: "LinkedIn",
    hero_github: "GitHub",
    hero_contact: "Contato",
    filter_stack: "Stack",
    filter_all: "Todas",
    projects_title: "Projetos",
    projects_subtitle: "Seleção de trabalhos em automação, análise de dados e integração de sistemas.",
    filter_showing: "Mostrando projetos com",
    filter_clear: "Limpar filtro",
    empty_all: "Nenhum projeto cadastrado ainda.",
    empty_filtered: "Nenhum projeto usa",
    link_live: "Ver ao vivo",
    link_github: "Ver no GitHub",
    badge_commercial: "Produto comercial",
    back_home: "Voltar aos projetos",
    section_screenshots: "Capturas de tela",
    side_stack: "Stack utilizada",
    side_links: "Links",
    footer_tagline: "Analista de BI & Automação de Processos, baseado em Maringá-PR.",
    footer_nav: "Navegação",
    footer_connect: "Conecte-se",
    footer_resume: "Baixar currículo",
    footer_admin: "Área restrita",
    footer_rights: "Todos os direitos reservados.",
    footer_credit_by: "Desenvolvido por",
    footer_credit_gh: "GitHub",
    contact_title: "Vamos conversar",
    contact_subtitle:
      "Tem um projeto de automação, BI ou integração de sistemas em mente? Me conte o que você precisa.",
    contact_name: "Nome",
    contact_email: "E-mail",
    contact_message: "Mensagem",
    contact_send: "Enviar mensagem",
    contact_sending: "Enviando…",
    contact_ok: "Mensagem enviada! Retorno em breve.",
    contact_err: "Não consegui enviar agora. Tente novamente ou use o e-mail direto abaixo.",
    contact_channels: "Outros canais",
    contact_email_label: "E-mail",
  },
  en: {
    nav_projects: "Projects",
    nav_contact: "Contact",
    hero_eyebrow: "Portfolio",
    hero_role: "BI Analyst & Process Automation",
    hero_bio:
      "15+ years managing processes and people, now applied to data, automation, and systems integration.",
    hero_linkedin: "LinkedIn",
    hero_github: "GitHub",
    hero_contact: "Contact",
    filter_stack: "Stack",
    filter_all: "All",
    projects_title: "Projects",
    projects_subtitle: "A selection of work in automation, data analysis, and systems integration.",
    filter_showing: "Showing projects with",
    filter_clear: "Clear filter",
    empty_all: "No projects yet.",
    empty_filtered: "No project uses",
    link_live: "View live",
    link_github: "View on GitHub",
    badge_commercial: "Commercial product",
    back_home: "Back to projects",
    section_screenshots: "Screenshots",
    side_stack: "Stack",
    side_links: "Links",
    footer_tagline: "BI Analyst & Process Automation, based in Maringá, Brazil.",
    footer_nav: "Navigation",
    footer_connect: "Connect",
    footer_resume: "Download resume",
    footer_admin: "Admin",
    footer_rights: "All rights reserved.",
    footer_credit_by: "Built by",
    footer_credit_gh: "GitHub",
    contact_title: "Let's talk",
    contact_subtitle: "Have an automation, BI, or systems-integration project in mind? Tell me about it.",
    contact_name: "Name",
    contact_email: "Email",
    contact_message: "Message",
    contact_send: "Send message",
    contact_sending: "Sending…",
    contact_ok: "Message sent! I'll get back to you soon.",
    contact_err: "Couldn't send right now. Please try again or email me directly below.",
    contact_channels: "Other channels",
    contact_email_label: "Email",
  },
};

const LANG_KEY = "site-lang";

function getLang() {
  return localStorage.getItem(LANG_KEY) || "pt";
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) || I18N.pt[key] || key;
}

function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const pairs = el.getAttribute("data-i18n-attr").split(",");
    pairs.forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      el.setAttribute(attr, t(key));
    });
  });
  document.documentElement.lang = getLang() === "en" ? "en" : "pt-BR";
  document.querySelectorAll(".lang-toggle button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.lang === getLang());
  });
}

function initLangToggle(onChange) {
  document.querySelectorAll(".lang-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLang(btn.dataset.lang);
      applyStaticI18n();
      if (typeof onChange === "function") onChange(getLang());
    });
  });
  applyStaticI18n();
}
