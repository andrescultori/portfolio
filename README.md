🇧🇷 Português | [🇺🇸 English](README.en.md)

# 💼 Portfólio — André Scultori

**Vitrine dos meus projetos de BI, automação e integração de sistemas, com um painel de administração próprio pra editar tudo sem depender de IDE nem de redeploy manual.**

Site estático (HTML/CSS/JS puro, sem build) publicado via Cloudflare Pages em **https://andrescultori.pages.dev/**, com o conteúdo (projetos, descrições, imagens) servido ao vivo por um banco Supabase e editável por um painel admin autenticado com a minha conta GitHub.

## Estrutura

```
index.html              Home (hero, filtro por stack, grid de projetos)
projeto.html             Página de detalhe de um projeto (?slug=...)
contato.html              Formulário de contato + canais
admin.html                Painel de administração (login GitHub, CRUD, upload de imagem, reordenar)
css/styles.css             Estilos
js/
  i18n.js                  Strings PT/EN da interface + toggle de idioma
  main.js                  Lógica da home
  project.js               Lógica da página de projeto
  projects-data.js          Lê os projetos do Supabase, com fallback pro data/projects.json
  supabase-config.js         URL e chave pública (publishable) do projeto Supabase
  admin.js                  Lógica do painel: login, CRUD, upload, drag-and-drop
  contact.js                Envio do formulário de contato
  social.js                 Links de redes sociais (um único lugar pra editar)
data/projects.json         Snapshot estático dos projetos — só usado como fallback se o Supabase cair
supabase/schema.sql         Referência do schema aplicado no Supabase (tabelas, RLS, Storage, Auth Hook)
img/
  profile/                  Sua foto (andre.jpg)
  projects/<slug>/           Screenshots reais, quando existirem
```

## Como editar os projetos

### Pelo painel admin (jeito normal)

Acesse `admin.html` → **Entrar com GitHub**. Só a conta autorizada (ver `supabase/schema.sql`) consegue salvar. De lá dá pra:

- criar, editar e excluir projetos;
- fazer upload de imagem (capa e screenshots) direto pro Storage do Supabase — sem precisar subir arquivo manualmente pelo GitHub;
- reordenar os projetos arrastando os cards pela alça **⠿** (sem editar número de ordem na mão).

Qualquer mudança aparece no site na hora — não precisa de `git push` nem de redeploy.

### Aba "Site" do painel admin

Além dos projetos, o admin edita o conteúdo geral do site (tabela `portfolio_site_settings` no Supabase):

- foto de perfil (upload direto, até 2 MB — JPG, PNG ou WEBP);
- headline e descrição do hero, títulos da seção Projetos e da página de Contato, e a frase do rodapé — em PT e EN, cada um com um botão "Restaurar padrão" individual;
- links do GitHub, LinkedIn e Instagram (alimentam o hero, o rodapé e a página de Contato).

Campos em branco mantêm o valor padrão já embutido no código — não precisa preencher tudo. Como no restante do admin, a mudança aparece no site ao vivo na hora; o HTML pré-renderizado só reflete no próximo deploy (ver "Build e deploy" abaixo).

### Editando `data/projects.json` na mão (fallback / modo de emergência)

Esse arquivo só é lido quando o site não consegue falar com o Supabase. Editá-lo manualmente **não atualiza o site enquanto o Supabase estiver no ar** — ele continua sendo a fonte real. Útil só como rede de segurança ou pra reconstruir os dados do zero se precisar.

## Build e deploy

O Cloudflare Pages builda o site a cada push com `npm run build` (`scripts/build.mjs`, build command/output directory configurados no painel do Cloudflare Pages: `npm run build` / `dist`), que gera uma versão **pré-renderizada** em `dist/` — HTML de verdade (home, cada projeto, sitemap, robots.txt), não dependente de JavaScript rodar no navegador. Isso existe para que crawlers, a prévia de links (LinkedIn etc.) e ATS de recrutamento vejam o conteúdo real, já que a interface interativa (filtro por stack, troca PT/EN) continua 100% client-side e inalterada.

- **Fonte dos dados no build**: primeiro tenta o Supabase (mesma tabela e filtro que o site usa em runtime); se falhar (rede, erro HTTP, JSON inválido, timeout de 10s) ou vier vazio, cai para `data/projects.json`. Rascunhos (`draft: true`) são sempre descartados, mesmo que o Supabase devolva algum.
- O mesmo vale para as configurações da aba "Site" (`portfolio_site_settings`): se o Supabase não responder, o build usa os valores padrão já embutidos no código (não há um JSON de fallback separado para isso).
- **`PRERENDER_SOURCE=json`**: força o build a ignorar o Supabase e usar só `data/projects.json` — útil para testes e builds 100% offline/determinísticos.
- **`SUPABASE_URL` / `SUPABASE_ANON_KEY`**: sobrescrevem os valores lidos de `js/supabase-config.js`, se precisar apontar para outro projeto (ex.: CI).
- O HTML estático só reflete o Supabase no momento do build — uma edição feita no painel admin não aparece no HTML pré-renderizado até o próximo deploy. O conteúdo *dinâmico* (o que o visitante vê depois que o JS carrega) continua sempre ao vivo, como hoje.
- Para rebuildar automaticamente depois de editar no admin, dá pra configurar um [Deploy Hook do Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/deploy-hooks/) e chamá-lo pelo próprio `admin.js` após salvar — não implementado ainda.

Comandos locais: `npm run build` (gera `dist/`) e `npm test` (testes do build, sem rede).

## Backend (Supabase)

O conteúdo vive num projeto Supabase compartilhado com outros apps meus, com todas as tabelas/funções prefixadas com `portfolio_` pra não colidir com nada. Detalhes completos — schema, políticas de RLS, bucket de imagens e o Auth Hook que restringe o login só à minha conta GitHub — estão documentados em [`supabase/schema.sql`](supabase/schema.sql).

## Configuração pendente

- `img/profile/andre.jpg` — sua foto (aparece no topo da home). Sem o arquivo, o espaço fica vazio.
- `js/social.js` — preencha `SOCIAL_LINKS.linkedin`, `SOCIAL_LINKS.instagram` e, se quiser, `SOCIAL_LINKS.resume` (PDF do currículo).
- `js/contact.js` — preencha `WEBHOOK_URL` com a URL do seu cenário no Make.com ou n8n para receber as mensagens do formulário de contato.

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Interface | HTML, CSS, JavaScript puro (sem framework, sem build) |
| Hospedagem | Cloudflare Pages |
| Dados + Auth + Storage | Supabase (Postgres, Auth, Storage) |
| Login do admin | GitHub OAuth (via Supabase Auth) |
| Reordenação no admin | Sortable.js |

---

*Licença: todos os direitos reservados — ver [LICENSE](LICENSE).*

Desenvolvido por [André Scultori](https://github.com/andrescultori) · © 2026 · [GitHub](https://github.com/andrescultori/portfolio)
