# portfolio

Portfólio pessoal de André Scultori — Analista de BI & Automação de Processos. Site estático (HTML/CSS/JS puro, sem build), publicado via GitHub Pages a partir da branch `main`, em **https://andrescultori.github.io/portfolio/**.

Qualquer `git push` na branch `main` atualiza o site automaticamente em alguns segundos — não precisa de nenhum passo manual de deploy.

## Estrutura

```
index.html          Home (hero, filtro por stack, grid de projetos)
projeto.html         Página de detalhe de um projeto (?slug=...)
contato.html         Formulário de contato + canais
css/styles.css        Estilos
js/
  i18n.js             Strings PT/EN da interface + toggle de idioma
  main.js             Lógica da home (carrega data/projects.json)
  project.js          Lógica da página de projeto
  contact.js          Envio do formulário de contato
  social.js           Links de redes sociais (um único lugar para editar)
data/projects.json    Todos os projetos — fonte única de dados
img/
  profile/            Sua foto (andre.jpg)
  projects/<slug>/     Imagem de capa (card.svg/png/jpg) e screenshots
```

## Como adicionar um novo projeto

Edite `data/projects.json` e adicione um objeto novo (copie um existente como base):

```json
{
  "slug": "nome-curto-unico",
  "title": "Nome do Projeto",
  "cardImage": "img/projects/nome-curto-unico/card.jpg",
  "screenshots": [
    "img/projects/nome-curto-unico/1.jpg",
    "img/projects/nome-curto-unico/2.jpg"
  ],
  "description": {
    "pt": "Descrição em português.",
    "en": "Description in English."
  },
  "stack": ["Tecnologia 1", "Tecnologia 2"],
  "links": {
    "live": "https://...",
    "github": "https://..."
  },
  "commercial": false,
  "featured": true,
  "sortOrder": 7
}
```

Coloque a imagem de capa e os screenshots em `img/projects/<slug>/`, dê `git add`, `commit` e `push`. Pronto — o site atualiza sozinho.

Campos opcionais:
- `commercial: true` — mostra o badge "Produto comercial" no card.
- `note: {"pt": "...", "en": "..."}` — aviso extra na página do projeto (ex: senha de demo).
- `draft: true` — esconde o projeto do site (rascunho).

## Configuração pendente

- `img/profile/andre.jpg` — sua foto (aparece no topo da home). Sem o arquivo, o espaço fica vazio.
- `js/social.js` — preencha `SOCIAL_LINKS.linkedin`, `SOCIAL_LINKS.instagram` e, se quiser, `SOCIAL_LINKS.resume` (PDF do currículo).
- `js/contact.js` — preencha `WEBHOOK_URL` com a URL do seu cenário no Make.com ou n8n para receber as mensagens do formulário de contato.
- Substitua os `img/projects/<slug>/card.svg` (placeholders gerados) por imagens/screenshots reais de cada projeto.

---

Desenvolvido por [André Scultori](https://github.com/andrescultori) · © 2026 · [GitHub](https://github.com/andrescultori/portfolio)
