"""Report overflow, small tap targets, and weak text contrast on every screen.

Usage:
    python -m http.server 8000     # one terminal, at the repo root
    python scripts/audit.py        # another terminal

Checks both phone widths at all three root sizes. Exits 1 when anything is
reported, so it can be wired into a pre-push hook. A developer tool, not a
CI step: CI has no browser and no server.

Set DENDRO_BASE when the server is on another port, for example
    DENDRO_BASE=http://localhost:8011/?content=dev
`shots.py` reads it and this script takes `BASE` from there.

The three checks answer the three lines of section 5 of the spec that a
person cannot judge by eye: no horizontal scroll, every control 44px, every
piece of text at 4.5 to 1 or better.

Every run measures the same screens. `shots.py` seeds the random number
generator and the store, walks a session route to the answer format the route
names, and holds each route to a selector it must print, so a state that
quietly fell back to another screen is reported rather than passed.
"""
import sys

from playwright.sync_api import sync_playwright

from shots import (
    MAX_TRIES, BASE, ROUTES, ROOTS, WIDTHS, open_page, reach, require
)

MIN_TARGET = 44
MIN_CONTRAST = 4.5
# A question must show its prompt and two answers inside this height, the
# height of a small phone. The page is laid out at the script's own viewport,
# 844 px, so the check is stricter than a 780 px phone.
FOLD = 780

JS = """
(limits) => {
  const out = {
    sw: document.documentElement.scrollWidth, over: [], small: [], dim: [], fold: []
  };
  const name = (node) => {
    const cls = typeof node.className === 'string' ? node.className.trim() : '';
    return node.tagName.toLowerCase() + (cls ? '.' + cls.split(/\\s+/).join('.') : '');
  };

  // ---------- horizontal overflow ----------
  // A node an ancestor clips cannot push the page wide, because the pixels
  // past the clip are never drawn. So the box is trimmed to every clipping
  // ancestor before it is judged. The walk stops at `#app`: the clip on
  // `#app` is the one that would hide a real layout overflow, which is what
  // this check is for, and `document.documentElement.scrollWidth` above is
  // the other half of the same question.
  const clipped = (node, box) => {
    let left = box.left;
    let right = box.right;
    for (let walk = node.parentElement; walk && walk.id !== 'app'; walk = walk.parentElement) {
      if (getComputedStyle(walk).overflowX === 'visible') continue;
      const frame = walk.getBoundingClientRect();
      left = Math.max(left, frame.left);
      right = Math.min(right, frame.right);
    }
    return { left, right };
  };

  // The banner sits outside #app, so it is named on its own line here.
  for (const node of document.querySelectorAll('#app *, #banner')) {
    const box = node.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    const seenBox = clipped(node, box);
    if (seenBox.right <= seenBox.left) continue;
    if (seenBox.right > limits.width + 0.5 || seenBox.left < -0.5) {
      out.over.push(name(node)
        + ' [' + Math.round(seenBox.left) + ',' + Math.round(seenBox.right) + ']');
    }
  }

  // ---------- tap targets ----------
  const controls = 'a[href], button, input, select, textarea, label, summary,'
    + ' [tabindex]:not([tabindex="-1"])';
  for (const node of document.querySelectorAll(controls)) {
    const box = node.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    // A control inside a label is reached by the label, so the label is the
    // target and a small input inside a big label is not a finding.
    const host = node.closest('label');
    if (host && host !== node) {
      const hostBox = host.getBoundingClientRect();
      if (hostBox.width >= limits.target && hostBox.height >= limits.target) continue;
    }
    // WCAG 2.5.8 exempts a link that sits inside a run of text: the line of
    // type sets its size, and growing it to 44px would break the line. The
    // credit's author link and the reveal title's answer link are both that
    // case. Every anchor the app means as a control is laid out as a block,
    // a flex box, or a grid, so `display: inline` is what tells them apart.
    if (node.tagName === 'A' && getComputedStyle(node).display === 'inline') continue;
    if (box.width < limits.target || box.height < limits.target) {
      out.small.push(name(node) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height));
    }
  }

  // ---------- text contrast ----------
  // Measured, not judged. Every text node's own computed colour against the
  // ground under it. The sheet paints most panels on a tint, so the paper is
  // not always the ground, and several of those tints are translucent:
  // `.pick` is a lichen wash at .46 alpha and `.typed input` is the same.
  // The walk therefore composites each translucent layer onto the one below
  // it, `c = a*fg + (1-a)*bg`, rather than climbing past it. Climbing past
  // would measure the text against the paper and report a ratio the reader
  // never sees.
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = (rgb) =>
    0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  const parse = (text) => {
    const parts = (text || '').match(/[\\d.]+/g);
    if (!parts || parts.length < 3) return null;
    return { rgb: parts.slice(0, 3).map(Number), a: parts.length > 3 ? Number(parts[3]) : 1 };
  };
  // Collect the layers from the text outwards, then paint them back to front.
  const backdrop = (node) => {
    const layers = [];
    let walk = node;
    let ground = [255, 255, 255];
    while (walk) {
      const paint = parse(getComputedStyle(walk).backgroundColor);
      if (paint && paint.a > 0.001) {
        layers.push(paint);
        if (paint.a >= 0.999) { ground = paint.rgb; break; }
      }
      walk = walk.parentElement;
    }
    // layers[0] is nearest the text, so paint from the far end inwards.
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      if (layer.a >= 0.999) { ground = layer.rgb; continue; }
      ground = ground.map((below, band) =>
        layer.a * layer.rgb[band] + (1 - layer.a) * below);
    }
    return ground;
  };
  const ratio = (one, two) => {
    const a = luminance(one);
    const b = luminance(two);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (text.textContent.trim() === '') continue;
    const host = text.parentElement;
    if (!host || seen.has(host)) continue;
    seen.add(host);
    // A screen-reader line and the sprite are never drawn, so neither has a
    // contrast to measure.
    if (host.closest('.sr, #dendro-sprite')) continue;
    const box = host.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const style = getComputedStyle(host);
    if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const ink = parse(style.color);
    if (!ink || ink.a < 0.999) continue;
    const got = ratio(ink.rgb, backdrop(host));
    if (got < limits.contrast) {
      out.dim.push(name(host) + ' ' + got.toFixed(2) + ':1 '
        + style.color + ' at ' + style.fontSize);
    }
  }

  // ---------- the fold ----------
  // A question shows its prompt and at least two answers above the fold. A
  // typed question has one answer control, so one is enough there.
  const bottomOf = (node) => node.getBoundingClientRect().bottom + window.scrollY;
  const prompt = document.querySelector('.prompt');
  if (prompt) {
    const answers = [...document.querySelectorAll('.key .pick, .invkey button, .typed input')];
    const above = answers.filter((node) => bottomOf(node) <= limits.fold).length;
    const wanted = Math.min(2, answers.length);
    if (bottomOf(prompt) > limits.fold || above < wanted) {
      out.fold.push('prompt ends at ' + Math.round(bottomOf(prompt)) + ', '
        + above + ' of ' + answers.length + ' answers end above ' + limits.fold);
    }
  }

  out.over = out.over.slice(0, 12);
  out.small = out.small.slice(0, 12);
  out.dim = out.dim.slice(0, 12);
  return out;
}
"""


def check(browser, frag, action, must, width, root):
    """Open one screen state and run the three checks over it."""
    tries = MAX_TRIES if action == "wrong" else 1
    for attempt in range(tries):
        page = open_page(browser, width, root, frag)
        try:
            if not reach(page, action, attempt):
                continue
            require(page, must, frag)
            page.wait_for_timeout(350)
            return page.evaluate(
                JS,
                {"width": width, "target": MIN_TARGET, "contrast": MIN_CONTRAST,
                 "fold": FOLD},
            )
        finally:
            page.close()
    raise RuntimeError(f"no {action} state in {tries} tries")


def main():
    print(f"base {BASE}")
    findings = 0
    with sync_playwright() as play:
        browser = play.chromium.launch()
        for width in WIDTHS:
            for root in ROOTS:
                print(f"=== width {width}, root {root}% ===")
                for name, frag, action, must in ROUTES:
                    try:
                        got = check(browser, frag, action, must, width, root)
                    except Exception as error:
                        # A screen that will not open is a finding of its own,
                        # and the rest of the sweep still runs.
                        findings += 1
                        print(f"FAIL {name:<16} {error}")
                        continue
                    bad = (got["sw"] > width or got["over"]
                           or got["small"] or got["dim"] or got["fold"])
                    flag = "FAIL" if bad else "ok  "
                    print(f"{flag} {name:<16} scrollWidth={got['sw']}")
                    for line in got["over"]:
                        print("       overflow > " + line)
                    for line in got["small"]:
                        print("       target   > " + line)
                    for line in got["dim"]:
                        print("       contrast > " + line)
                    for line in got["fold"]:
                        print("       fold     > " + line)
                    if bad:
                        findings += 1
        browser.close()
    print(f"\n{findings} screen states with findings.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
