/* Contact form submit handler.
   Set WEBHOOK_URL below to your Make.com / n8n webhook once it exists.
   Until then the form shows a friendly "not configured" message instead of failing silently. */

const WEBHOOK_URL = ""; // e.g. "https://hook.us1.make.com/xxxxxxxxxxxxxxxxxxxx"

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const status = document.getElementById("form-status");
  const btn = document.getElementById("submit-btn");

  const payload = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    message: form.message.value.trim(),
    source: "andrescultori.github.io",
    lang: getLang(),
    sentAt: new Date().toISOString(),
  };

  if (!payload.name || !payload.email || !payload.message) return;

  if (!WEBHOOK_URL) {
    status.className = "form-status err";
    status.textContent =
      getLang() === "en"
        ? "Contact form isn't wired up yet — please email me directly below."
        : "O formulário ainda não está conectado a um webhook — use o e-mail direto abaixo, por favor.";
    return;
  }

  btn.disabled = true;
  status.className = "form-status";
  status.textContent = t("contact_sending");

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("bad status");
    status.className = "form-status ok";
    status.textContent = t("contact_ok");
    form.reset();
  } catch (err) {
    status.className = "form-status err";
    status.textContent = t("contact_err");
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initLangToggle();
  const form = document.getElementById("contact-form");
  if (form) form.addEventListener("submit", handleSubmit);
});
