const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

// U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR, built via
// fromCharCode (rather than a \u escape literal) so the source file holds
// the actual character for matching, not an escape sequence.
const LINE_SEPARATOR = String.fromCharCode(8232);
const PARAGRAPH_SEPARATOR = String.fromCharCode(8233);

/* Serializes a value for embedding inside <script type="application/ld+json">.
   Escapes "<" (as the JSON string-escape for U+003C) so a value containing
   a closing script tag can't break out of it, and the line/paragraph
   separator characters above (as their own JSON string escapes) since
   they're valid inside JSON strings but can trip up naive line-based
   processing. These are JSON string-escape sequences, not HTML entities, so
   the result stays valid JSON — JSON.parse resolves them back to the
   original characters. */
export function safeJsonLd(value) {
  return JSON.stringify(value)
    .split("<")
    .join("\\u003c")
    .split(LINE_SEPARATOR)
    .join("\\u2028")
    .split(PARAGRAPH_SEPARATOR)
    .join("\\u2029");
}
