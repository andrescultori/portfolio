/* Centralized bilingual UI copy for the public site's new pages
   (home, /work/ index, project/case-study pages). Keeping every new
   string in one place makes PT review straightforward — see the PR
   description for the full list.

   Project content itself (titles, descriptions, case studies, services,
   process steps) stays in data/projects.json and data/*.json, already
   bilingual there. This file is only for fixed page chrome: nav labels,
   section eyebrows/headings not sourced from data, buttons, footer. */

export const CATEGORY_LABELS = {
  en: { "data-bi": "Data & BI", automation: "Automation", apps: "Apps" },
  pt: { "data-bi": "Dados & BI", automation: "Automação", apps: "Apps" },
};

export function categoryLabel(lang, category) {
  const table = CATEGORY_LABELS[lang] || CATEGORY_LABELS.en;
  return table[category] || table.apps;
}

export const STRINGS = {
  en: {
    html_lang: "en",
    skip_link: "Skip to content",
    nav_services: "Services",
    nav_work: "Work",
    nav_process: "Process",
    nav_about: "About",
    nav_book_call: "Book a call",
    nav_menu: "Menu",

    hero_eyebrow_default: "BI & automation consultant · Maringá, Brazil · Remote",
    hero_h1: "I turn scattered spreadsheets and manual processes into dashboards and automations teams actually use.",
    hero_sub_default:
      "Fifteen years running operations in education, now building data products with Power BI, Power Query and Make.com for small teams and organizations in Brazil and abroad.",
    hero_cta_primary: "See case studies",
    hero_cta_secondary: "Book a call",
    hero_note: "Open to full-time remote roles and selected freelance projects.",
    hero_sketch_caption: "Layout sketch — replace with a real dashboard screenshot",

    worked_with: "Worked with",

    services_eyebrow: "Services",
    services_h2: "Three ways I can help your team work with better data.",
    timeline_prefix: "Typical timeline: ",

    work_eyebrow: "Selected work",
    work_h2: "Problem, approach, result.",
    work_all_link: "All case studies",

    process_eyebrow: "How I work",
    process_h2: "Four steps, with something to look at after each one.",

    about_eyebrow: "About",
    about_h2: "I start from the decision the data has to support, not from the tool.",
    about_p:
      "I spent fifteen years managing programs, people and student data in education before moving into BI. That is why I care about definitions, data quality and handover as much as the dashboard itself.",
    about_analytics_label: "Analytics",
    about_analytics_value: "Power BI, Power Query, Excel, Google Sheets",
    about_automation_label: "Automation",
    about_automation_value: "Make.com, n8n, Apps Script",
    about_data_apps_label: "Data & apps",
    about_data_apps_value: "Supabase, JavaScript, React",
    about_education_label: "Education",
    about_education_value: "Postgraduate degree in Data Science",
    about_languages_label: "Languages",
    about_languages_value: "Portuguese (native), English (fluent)",

    apps_eyebrow: "Side projects",
    apps_h2: "Personal projects built to practice with real-world scenarios.",

    contact_h2: "Let's talk about your data.",
    contact_p:
      "Hiring for a BI or analytics role, or have a dashboard or automation in mind? Tell me what you are trying to decide or stop doing by hand.",
    contact_book: "Book a 30-minute call",
    contact_email: "Email me",
    contact_cv: "Download CV",
    contact_linkedin: "LinkedIn",

    footer_copyright: "© 2026 André Scultori · Maringá, Brazil",
    footer_github: "GitHub",
    footer_linkedin: "LinkedIn",
    footer_restricted: "Restricted area",

    work_index_h1: "Case studies",
    work_index_sub: "Every project, filterable by category.",
    filter_all: "All",

    cs_eyebrow: "Case study",
    cs_meta_tools: "Tools",
    cs_section_context: "Context and problem",
    cs_section_approach: "Approach",
    cs_section_insights: "What the data showed",
    cs_section_results: "Results",
    cs_back: "← All work",
    cs_cta_h2: "Have a similar problem?",
    cs_cta_next: "Next case study →",
    cs_metric_measured: "measured",
    cs_metric_estimated: "estimated",
    cs_demo_caption: "Demo with fictional data.",

    fallback_screenshots: "Screenshots",
    fallback_stack: "Stack",
    fallback_links: "Links",
    link_live: "View live",
    link_github: "View on GitHub",
    badge_commercial: "Commercial product",
  },
  pt: {
    html_lang: "pt-BR",
    skip_link: "Pular para o conteúdo",
    nav_services: "Serviços",
    nav_work: "Projetos",
    nav_process: "Processo",
    nav_about: "Sobre",
    nav_book_call: "Agendar conversa",
    nav_menu: "Menu",

    hero_eyebrow_default: "Consultor de BI & automação · Maringá, Brasil · Remoto",
    hero_h1:
      "Transformo planilhas espalhadas e processos manuais em dashboards e automações que o time realmente usa.",
    hero_sub_default:
      "Quinze anos gerindo operações na área de educação, hoje construindo produtos de dados com Power BI, Power Query e Make.com para times e organizações pequenas no Brasil e no exterior.",
    hero_cta_primary: "Ver estudos de caso",
    hero_cta_secondary: "Agendar conversa",
    hero_note: "Aberto a vagas remotas CLT/PJ e projetos freelance selecionados.",
    hero_sketch_caption: "Esboço de layout — substituir por uma captura de tela real do dashboard",

    worked_with: "Já trabalhei com",

    services_eyebrow: "Serviços",
    services_h2: "Três formas de ajudar seu time a trabalhar melhor com dados.",
    timeline_prefix: "Prazo típico: ",

    work_eyebrow: "Projetos selecionados",
    work_h2: "Problema, abordagem, resultado.",
    work_all_link: "Todos os estudos de caso",

    process_eyebrow: "Como eu trabalho",
    process_h2: "Quatro etapas, com algo concreto para ver depois de cada uma.",

    about_eyebrow: "Sobre",
    about_h2: "Eu parto da decisão que os dados precisam sustentar, não da ferramenta.",
    about_p:
      "Passei quinze anos gerindo programas, pessoas e dados de alunos na área de educação antes de migrar para BI. Por isso me importo tanto com definições, qualidade de dados e entrega quanto com o dashboard em si.",
    about_analytics_label: "Analytics",
    about_analytics_value: "Power BI, Power Query, Excel, Google Sheets",
    about_automation_label: "Automação",
    about_automation_value: "Make.com, n8n, Apps Script",
    about_data_apps_label: "Dados & apps",
    about_data_apps_value: "Supabase, JavaScript, React",
    about_education_label: "Formação",
    about_education_value: "Pós-graduação em Data Science",
    about_languages_label: "Idiomas",
    about_languages_value: "Português (nativo), Inglês (fluente)",

    apps_eyebrow: "Projetos pessoais",
    apps_h2: "Projetos pessoais construídos para praticar com cenários reais.",

    contact_h2: "Vamos falar sobre os seus dados.",
    contact_p:
      "Contratando para uma vaga de BI ou análise de dados, ou tem um dashboard ou automação em mente? Me conte o que você está tentando decidir ou parar de fazer manualmente.",
    contact_book: "Agendar uma conversa de 30 minutos",
    contact_email: "Enviar e-mail",
    contact_cv: "Baixar currículo",
    contact_linkedin: "LinkedIn",

    footer_copyright: "© 2026 André Scultori · Maringá, Brasil",
    footer_github: "GitHub",
    footer_linkedin: "LinkedIn",
    footer_restricted: "Área restrita",

    work_index_h1: "Estudos de caso",
    work_index_sub: "Todos os projetos, com filtro por categoria.",
    filter_all: "Todas",

    cs_eyebrow: "Estudo de caso",
    cs_meta_tools: "Ferramentas",
    cs_section_context: "Contexto e problema",
    cs_section_approach: "Abordagem",
    cs_section_insights: "O que os dados mostraram",
    cs_section_results: "Resultados",
    cs_back: "← Todos os projetos",
    cs_cta_h2: "Tem um problema parecido?",
    cs_cta_next: "Próximo estudo de caso →",
    cs_metric_measured: "medido",
    cs_metric_estimated: "estimado",
    cs_demo_caption: "Demonstração com dados fictícios.",

    fallback_screenshots: "Capturas de tela",
    fallback_stack: "Stack",
    fallback_links: "Links",
    link_live: "Ver ao vivo",
    link_github: "Ver no GitHub",
    badge_commercial: "Produto comercial",
  },
};

export function t(lang, key) {
  const table = STRINGS[lang] || STRINGS.en;
  return table[key] != null ? table[key] : STRINGS.en[key] || key;
}
