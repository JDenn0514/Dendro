// The three DOM helpers every screen uses. Nothing else belongs here.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function link(href, className, text) {
  const node = el('a', className, text);
  node.href = href;
  return node;
}

// A legend the screen reader hears and the page does not print.
export function srOnly(text) {
  return el('span', 'sr', text);
}
