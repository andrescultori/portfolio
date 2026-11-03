🇧🇷 Português | [🇺🇸 English](README.en.md)

# 💼 Portfólio — André Scultori

**Vitrine dos meus projetos de BI, automação e integração de sistemas, com um painel de administração próprio pra editar tudo sem depender de IDE nem de redeploy manual.**

Site estático (HTML/CSS/JS puro, sem build) publicado via Cloudflare Pages em **https://andrescultori.pages.dev/**, com o conteúdo (projetos, descrições, imagens) servido ao vivo por um banco Supabase e editável por um painel admin autenticado com a minha conta GitHub.

## Estrutura

O site público (home, /work/, páginas de projeto) é **100% pré-renderizado**: não existe mais HTML-template + JS client-side juntando os dados em runtime. `scripts/build.mjs` gera cada página inteira a partir de `scripts/lib/render-*.mjs`, em inglês (raiz `/`) e português (`/pt/`), e o navegador só carrega `css/site.css` + `js/motion.js` (puramente de apresentação — animações e o menu mobile, nada de dados). `admin.html`/`pm.html` continuam sendo os mesmos arquivos de sempre, com seu próprio `css/styles.css`, nunca tocados por essa mudança.

```
admin.html                 Painel de administração (login GitHub, CRUD, upload de imagem, reordenar)
pm.html                    Gerenciador de projetos pessoal (mesmo login do admin)
css/
  styles.css                Estilos do admin/pm — nunca carregado pelas páginas públicas
  site.css                   Estilos do site público — nunca carregado por admin/pm
  pm.css                      Estilos específicos do pm.html
js/
  motion.js                  Camada de animação do site público (ver seção "Motion" abaixo) + o menu mobile
  supabase-config.js          URL e chave pública (publishable) do projeto Supabase — usado por admin/pm
  admin.js                   Lógica do painel: login, CRUD, upload, drag-and-drop
  pm.js                       Lógica do gerenciador de projetos pessoal
  social.js                   Defaults de links/currículo (lidos pelo build, não pelo navegador)
data/
  projects.json               Snapshot estático dos projetos — fallback se o Supabase cair
  services.json                Os 3 cards de "Services" (PT/EN)
  process.json                 As 4 etapas de "How I work" (PT/EN)
  clients.json                 Logos de clientes para a faixa "Worked with" — veja abaixo
scripts/
  build.mjs                    Orquestra o build inteiro (ambos os idiomas, sitemap, _redirects, robots.txt)
  lib/render-home.mjs           Gera a home (EN e PT)
  lib/render-work-index.mjs     Gera /work/ e /pt/trabalhos/
  lib/render-project-page.mjs   Gera cada página de projeto (case study ou layout simples)
  lib/public-strings.mjs        Toda a cópia PT/EN fixa de interface (nav, botões, labels)
  lib/public-urls.mjs           Caminhos localizados (/work/, /pt/trabalhos/, /projects/<slug>/, ...)
  lib/public-chrome.mjs         <head>, header, footer e o shell de página compartilhados
  lib/redirects.mjs             Gera o _redirects (URLs antigas → novas)
supabase/schema.sql          Referência do schema aplicado no Supabase (tabelas, RLS, Storage, Auth Hook)
img/
  profile/                  Sua foto (andre.jpg)
  projects/<slug>/           Screenshots reais, quando existirem
```

### `data/clients.json`

Array de `{ "name": "...", "logo": "img/clients/....png", "url": "https://...", "approved": true }`. A faixa "Worked with" na home só mostra entradas com `approved: true` **e** `logo` preenchido — vazio ou tudo `approved: false` significa que a seção inteira não é renderizada (sem placeholder "[Client logo]"). Editar esse arquivo ainda exige um novo build/deploy — não tem UI no admin pra isso hoje.

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

O Cloudflare Pages builda o site a cada push com `npm run build` (`scripts/build.mjs`, build command/output directory configurados no painel do Cloudflare Pages: `npm run build` / `dist`), que gera o site **inteiro, em inglês e português, totalmente pré-renderizado** em `dist/` — sem nenhuma troca de idioma em runtime: cada idioma é uma árvore de páginas separada.

- **URLs**: inglês (padrão) na raiz — `/`, `/work/`, `/projects/<slug>/`; português em `/pt/` — `/pt/`, `/pt/trabalhos/`, `/pt/projetos/<slug>/`. Cada página carrega `<link rel="alternate" hreflang="...">` apontando pra sua irmã no outro idioma, mais `x-default` → inglês.
- **`dist/sitemap.xml`** lista as duas versões de cada página com seus `hreflang`; **`dist/robots.txt`** permite tudo exceto `/admin.html` e `/pm.html` (`noindex`); **`dist/_redirects`** (lido pelo Cloudflare Pages) redireciona 301 as URLs antigas de antes desse redesign (`/projeto/<slug>/` → `/pt/projetos/<slug>/`, `/contato.html` → `/#contact`, `/projeto.html` → `/work/`).
- **Fonte dos dados no build**: primeiro tenta o Supabase; se falhar (rede, erro HTTP, JSON inválido, timeout de 10s) ou vier vazio, cai para `data/projects.json`. Rascunhos (`draft: true`) são sempre descartados, mesmo que o Supabase devolva algum.
- O mesmo vale para as configurações da aba "Site" (`portfolio_site_settings`): se o Supabase não responder, o build usa os valores padrão já embutidos no código.
- **`PRERENDER_SOURCE=json`**: força o build a ignorar o Supabase e usar só `data/projects.json` — útil para testes e builds 100% offline/determinísticos.
- **`SUPABASE_URL` / `SUPABASE_ANON_KEY`**: sobrescrevem os valores lidos de `js/supabase-config.js`, se precisar apontar para outro projeto (ex.: CI).
- **O site público não tem mais nenhum JavaScript de dados** (sem fetch ao Supabase no navegador) — tudo é decidido no momento do build. Uma edição no painel admin (projetos, textos do hero, links, foto) só aparece no site depois do próximo deploy. Isso é uma mudança de comportamento: antes, texto/links/foto editados no admin apareciam na hora (um script client-side reaplicava o override a cada carregamento de página); agora, como todo o HTML é gerado no build, precisa de um novo deploy — igual ao que já valia pros próprios projetos. Pra reaplicar automaticamente, configure um [Deploy Hook do Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/deploy-hooks/) e chame-o pelo `admin.js` após salvar — não implementado ainda.

Comandos locais: `npm run build` (gera `dist/`) e `npm test` (testes do build, sem rede).

## Motion — camada de animação reutilizável

`js/motion.js` é uma biblioteca pequena, sem dependências, controlada inteiramente por atributos `data-*` — pensada pra ser copiada para outros sites (inclusive projetos de cliente) sem precisar entender a estrutura desta página. Carregada só nas páginas públicas (nunca em `admin.html`/`pm.html`).

**Regras que toda a biblioteca segue:**
- Anima só `transform` e `opacity` — nunca propriedades que causam reflow (nenhum layout shift).
- Progressive enhancement: o conteúdo é visível e correto sem JavaScript. Um script inline no `<head>` de cada página (gerado por `scripts/lib/public-chrome.mjs`) adiciona a classe `js` ao `<html>` *antes* de qualquer observer rodar — `css/site.css` só esconde `[data-reveal]`/`[data-grow]` dentro de `.js ...`, nunca por padrão. Esse mesmo script arma um timer de 1.5s que força tudo visível (`reveal-fallback`) caso `js/motion.js` nunca termine de carregar — então ele roda mesmo se o arquivo falhar (404, bloqueio, erro de rede).
- Respeita `prefers-reduced-motion: reduce`: com a preferência ativa, tudo aparece no estado final imediatamente, sem nenhuma animação.
- Nenhuma animação passa de 600ms; nada roda em loop sozinho.

**API (atributos `data-*`):**

| Atributo | Onde | O que faz |
|---|---|---|
| `data-reveal` | em qualquer elemento | Fade + translateY(12px) → normal, uma vez, ao entrar na viewport. |
| `data-reveal-delay="<ms>"` | no próprio elemento | Atraso fixo antes de revelar (sobrepõe o stagger do pai, se houver). |
| `data-reveal-stagger="<ms>"` | no elemento **pai** | Cada filho com `data-reveal` revela com `índice × ms` de atraso. |
| `data-grow` | em barras/linhas | Escala de 0 → 1 (`scaleY`, origem embaixo) ao entrar na viewport, uma vez. |
| `data-grow="x"` | em barras/linhas horizontais | Mesma coisa, mas `scaleX` com origem à esquerda. |
| `data-grow-stagger="<ms>"` | no elemento **pai** | Igual ao `data-reveal-stagger`, para `data-grow`. |
| `data-count="<número>"` | em um `<span>` etc. | Conta de 0 até o número ao entrar na viewport (600ms, easing). |
| `data-prefix` / `data-suffix` / `data-decimals` | no mesmo elemento | Formatação do `data-count` (ex.: `~`, `%`, casas decimais). |

Importante: o texto inicial do elemento já precisa ser o **valor final correto** (ex.: um `data-count="15"` já deve conter `"15"` no HTML) — isso garante que robôs de busca, modo sem JS e `prefers-reduced-motion` sempre vejam o número certo, já que a única coisa que o JS faz é *animar a transição até* esse valor.

**Fora da API de atributos** (específico deste site, não pensado pra reaproveitar): o toggle do menu mobile (`.nav-toggle`/`.nav-panel`) e o filtro de categoria da página `/work/` (`[data-filter]`/`[data-category]`) — ambos puramente visuais, com tudo visível por padrão sem JS.

Veja `js/motion.js` para a implementação (bem curta, ~230 linhas) e `tests/motion.test.mjs`/`tests/motion-dist.test.mjs` para exemplos de uso de cada atributo.

## Backend (Supabase)

O conteúdo vive num projeto Supabase compartilhado com outros apps meus, com todas as tabelas/funções prefixadas com `portfolio_` pra não colidir com nada. Detalhes completos — schema, políticas de RLS, bucket de imagens e o Auth Hook que restringe o login só à minha conta GitHub — estão documentados em [`supabase/schema.sql`](supabase/schema.sql).

## Configuração pendente

- **Foto de perfil** — defina pela aba "Site" do admin (upload direto). Sem foto configurada, a coluna de foto da seção "About" simplesmente não é renderizada.
- `js/social.js` (ou a aba "Site" do admin, que tem prioridade) — preencha `linkedin`, `instagram`, `booking` (link de agendamento, precisa ser `https://`) e `cv_en`/`cv_pt` (currículo em cada idioma — `https://...` ou um caminho `/cv/arquivo.pdf` commitado no repo). Cada botão do Contato (Book a call, Download CV, LinkedIn) só aparece quando o link correspondente está preenchido.
- `data/clients.json` — logos de clientes aprovados para a faixa "Worked with" (vazio por padrão — ver seção "Estrutura" acima).
- O formulário de contato foi removido neste redesign — a seção de Contato agora é só botões (agendar, e-mail, currículo, LinkedIn); não há mais `WEBHOOK_URL`/`js/contact.js`.

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
