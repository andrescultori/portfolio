[🇧🇷 Português](README.md) | 🇺🇸 English

# 💼 Portfolio — André Scultori

**Showcase of my BI, automation and systems-integration projects, with its own admin panel to edit everything without an IDE or a manual redeploy.**

Static site (vanilla HTML/CSS/JS, no build step) published via Vercel at **https://andrescultori.vercel.app/**, with content (projects, descriptions, images) served live from a Supabase database and editable through an admin panel authenticated with my own GitHub account.

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

### Editing `data/projects.json` by hand (fallback / emergency mode)

This file is only read when the site can't reach Supabase. Editing it manually **does not update the live site while Supabase is up** — Supabase remains the actual source of truth. It's only useful as a safety net, or to rebuild the data from scratch if ever needed.

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
| Hosting | Vercel |
| Data + Auth + Storage | Supabase (Postgres, Auth, Storage) |
| Admin login | GitHub OAuth (via Supabase Auth) |
| Admin reordering | Sortable.js |

---

*License: all rights reserved — see [LICENSE](LICENSE).*

Built by [André Scultori](https://github.com/andrescultori) · © 2026 · [GitHub](https://github.com/andrescultori/portfolio)
