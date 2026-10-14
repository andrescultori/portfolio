[🇧🇷 Português](README.md) | 🇺🇸 English

# 💼 Portfolio — André Scultori

**Showcase of my BI, automation and systems-integration projects, with its own admin panel to edit everything without an IDE or a manual redeploy.**

Static site (vanilla HTML/CSS/JS, no build step) published via Cloudflare Pages at **https://andrescultori.pages.dev/**, with content (projects, descriptions, images) served live from a Supabase database and editable through an admin panel authenticated with my own GitHub account.

## Structure

```
index.html              Home (hero, stack filter, project grid)
projeto.html             Project detail page (?slug=...)
contato.html              Contact form + channels
admin.html                Admin panel (GitHub login, CRUD, image upload, reordering)
css/styles.css             Styles
js/
  i18n.js                  PT/EN UI strings + language toggle
  main.js                  Home page logic
  project.js               Project detail page logic
  projects-data.js          Reads projects from Supabase, falls back to data/projects.json
  supabase-config.js         Supabase project URL and publishable key
  admin.js                  Panel logic: login, CRUD, upload, drag-and-drop
  contact.js                Contact form submission
  social.js                 Social links (one place to edit)
data/projects.json         Static snapshot of the projects — only used as a fallback if Supabase is unreachable
supabase/schema.sql         Reference of the schema deployed on Supabase (tables, RLS, Storage, Auth Hook)
img/
  profile/                  Profile photo (andre.jpg)
  projects/<slug>/           Real screenshots, where they exist
```

## Editing projects

### Through the admin panel (normal way)

Open `admin.html` → **Sign in with GitHub**. Only the authorized account (see `supabase/schema.sql`) can save. From there you can:

- create, edit and delete projects;
- upload images (card cover and screenshots) straight to Supabase Storage — no need to push files through GitHub by hand;
- reorder projects by dragging the cards by the **⠿** handle, instead of editing a sort number.

Changes show up on the live site immediately — no `git push`, no redeploy.

### The admin panel's "Site" tab

Besides projects, the admin also edits the site's general content (the `portfolio_site_settings` table in Supabase):

- profile photo (direct upload, up to 2 MB — JPG, PNG or WEBP);
- the hero's headline and bio, the Projects section's title/subtitle, the Contact page's title/subtitle, and the footer tagline — in PT and EN, each with its own "Restore default" button;
- GitHub, LinkedIn and Instagram links (feed the hero, the footer, and the Contact page).

Blank fields keep the default already baked into the code — you don't need to fill in everything. Like the rest of the admin, changes show up on the live site immediately; the prerendered HTML only picks it up on the next deploy (see "Build and deploy" below).

### Editing `data/projects.json` by hand (fallback / emergency mode)

This file is only read when the site can't reach Supabase. Editing it manually **does not update the live site while Supabase is up** — Supabase remains the actual source of truth. It's only useful as a safety net, or to rebuild the data from scratch if ever needed.

## Build and deploy

Cloudflare Pages builds the site on every push with `npm run build` (`scripts/build.mjs`, build command/output directory set in the Cloudflare Pages dashboard: `npm run build` / `dist`), which generates a **prerendered** version in `dist/` — real HTML (home, each project page, sitemap, robots.txt) that doesn't depend on JavaScript running in the browser. This exists so crawlers, link previews (LinkedIn, etc.) and recruiting ATS systems see the real content, since the interactive UI (stack filter, PT/EN toggle) stays fully client-side and unchanged.

- **Build-time data source**: tries Supabase first (same table and filter the site uses at runtime); on failure (network, HTTP error, invalid JSON, 10s timeout) or an empty result, it falls back to `data/projects.json`. Drafts (`draft: true`) are always discarded, even if Supabase returns one.
- The same applies to the "Site" tab's settings (`portfolio_site_settings`): if Supabase doesn't respond, the build uses the defaults already baked into the code (there's no separate JSON fallback for this one).
- **`PRERENDER_SOURCE=json`**: forces the build to skip Supabase and use only `data/projects.json` — useful for tests and fully offline/deterministic builds.
- **`SUPABASE_URL` / `SUPABASE_ANON_KEY`**: override the values read from `js/supabase-config.js`, if you need to point at a different project (e.g. CI).
- The static HTML only reflects Supabase as of build time — an edit made in the admin panel won't show up in the prerendered HTML until the next deploy. The *dynamic* content (what a visitor sees once JS loads) stays live as it does today.
- To auto-rebuild after editing in the admin, you could wire up a [Cloudflare Pages Deploy Hook](https://developers.cloudflare.com/pages/configuration/deploy-hooks/) and call it from `admin.js` after saving — not implemented yet.

Local commands: `npm run build` (generates `dist/`) and `npm test` (build tests, no network).

## Backend (Supabase)

Content lives in a Supabase project shared with other apps of mine, with every table and function prefixed with `portfolio_` so nothing collides. Full details — schema, RLS policies, the image storage bucket and the Auth Hook that restricts sign-in to my own GitHub account — are documented in [`supabase/schema.sql`](supabase/schema.sql).

## Pending setup

- `img/profile/andre.jpg` — your photo (shows at the top of the home page). The space stays empty without this file.
- `js/social.js` — fill in `SOCIAL_LINKS.linkedin`, `SOCIAL_LINKS.instagram` and, optionally, `SOCIAL_LINKS.resume` (resume PDF).
- `js/contact.js` — fill in `WEBHOOK_URL` with your Make.com or n8n scenario URL to receive contact form messages.

## Tech stack

| Layer | Technology |
|---|---|
| UI | Plain HTML, CSS, JavaScript (no framework, no build step) |
| Hosting | Cloudflare Pages |
| Data + Auth + Storage | Supabase (Postgres, Auth, Storage) |
| Admin login | GitHub OAuth (via Supabase Auth) |
| Admin reordering | Sortable.js |

---

*License: all rights reserved — see [LICENSE](LICENSE).*

Built by [André Scultori](https://github.com/andrescultori) · © 2026 · [GitHub](https://github.com/andrescultori/portfolio)
