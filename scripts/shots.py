"""Screenshot every Dendro screen at both phone widths and all three root sizes.

Usage:
    python -m http.server 8000                 # one terminal, at the repo root
    python scripts/shots.py out/shots          # another terminal

Writes <out>/<screen>-<width>-<root>.png: nine routes at two widths at three
root sizes, 54 files in all. A developer tool, not a CI step: CI has no
browser and no server.

Set DENDRO_BASE when the server is on another port, for example
    DENDRO_BASE=http://localhost:8011/?content=dev

A route that fails is reported and skipped. One screen that will not open
must not cost the other 53 shots.
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("DENDRO_BASE", "http://localhost:8000/?content=dev")
WIDTHS = [360, 390]
ROOTS = ["80", "100", "130"]

# name, hash, what to do once the page has loaded:
#   None      shoot the page as it stands
#   "wrong"   answer the card with something that is not the answer, then shoot
ROUTES = [
    ("home", "#/", None),
    ("lessons", "#/lessons", None),
    ("lessons-leaf", "#/lessons/leaf", None),
    ("progress", "#/progress", None),
    ("progress-shape", "#/progress/leaf/simple_lobed", None),
    ("species", "#/species/QURU", None),
    ("settings", "#/settings", None),
    ("session", "#/session?focus=leaf&unit=leaf_types", None),
    ("reveal", "#/session?focus=leaf&unit=leaf_types", "wrong"),
]

# The script cannot see the answer, so on a choice card it tries one label,
# and on a right answer opens a fresh page and tries another. `new_page` gives
# each attempt its own storage, so the deck starts over and the labels are
# shuffled again.
MAX_TRIES = 6

# Every screen draws from the stored card levels: the rungs and the bands on
# progress, the squares on lessons and species, the deck of the session. An
# empty store prints an empty app, so each page is seeded before it is shot.
# The seed reads the same content the app reads, derives the same card ids, and
# gives one card in five each of the four levels, leaving the fifth new.
SEED_JS = """
async () => {
  const dir = new URLSearchParams(location.search).get('content') === 'dev'
    ? 'content_dev/' : 'content/';
  const files = {
    species: 'species.json', concepts: 'concepts.json',
    confusion: 'confusion.json', units: 'units.json',
    manifest: 'images/manifest.json'
  };
  const raw = {};
  for (const [field, file] of Object.entries(files)) {
    const response = await fetch(dir + file);
    if (!response.ok) throw new Error(dir + file + ' returned ' + response.status);
    raw[field] = await response.json();
  }
  const module = await import('/app/logic/content.js');
  const result = module.loadContent(raw);
  if (!result.ok) throw new Error('the content did not validate');

  // Local dates, the way the app writes them.
  const today = new Date().toLocaleDateString('en-CA');
  const later = new Date(Date.now() + 20 * 86400000).toLocaleDateString('en-CA');

  // The two lower tiers are due today, so the session deck is drawn from them
  // and the card on screen is a choice card. The two upper tiers are parked,
  // so they count towards the levels and stay out of the deck.
  const table = [
    null,
    { tier: 'mc4', tier_passes: 0, due: today, interval: 1, reps: 1 },
    { tier: 'mc8', tier_passes: 0, due: today, interval: 9, reps: 4 },
    { tier: 'inv', tier_passes: 0, due: later, interval: 25, reps: 7 },
    { tier: 'typed', tier_passes: 2, due: later, interval: 40, reps: 11 }
  ];

  const cards = {};
  Object.keys(result.content.cards).sort().forEach((id, index) => {
    const seed = table[index % table.length];
    if (!seed) return;
    cards[id] = {
      interval: seed.interval, ease: 2.5, due: seed.due, reps: seed.reps,
      lapses: 0, recent: ['good'], tier: seed.tier, tier_passes: seed.tier_passes
    };
  });
  localStorage.setItem('dendro_cards', JSON.stringify({ version: 1, cards }));
  return Object.keys(cards).length;
}
"""


def open_page(browser, width, root, frag, scale=1):
    """Open one route at one width and one root size, settled and ready."""
    page = browser.new_page(
        viewport={"width": width, "height": 844},
        device_scale_factor=scale,
    )
    # The store is read at boot, so the seed goes in on a first load and the
    # route is opened again on top of it.
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.evaluate(SEED_JS)
    page.goto(BASE + frag)
    page.reload()
    page.wait_for_load_state("networkidle")
    page.evaluate("s => document.documentElement.style.fontSize = s", root + "%")
    page.wait_for_timeout(600)  # let the webfonts and the plates settle
    return page


def answer(page, attempt):
    """Answer the card on screen, whatever format it is in.

    `attempt` picks which label to try on a choice card. Returns "right",
    "wrong", or "" when the page holds no answer control at all.
    """
    picks = page.query_selector_all(".key .pick")
    options = page.query_selector_all(".invkey button")
    if picks:
        picks[attempt % len(picks)].click()
    elif options:
        options[attempt % len(options)].click()
    elif page.query_selector(".typed input"):
        # No tree is called this, so a typed card always reveals as wrong.
        page.fill(".typed input", "notatree")
        page.click(".typed .btn")
    else:
        return ""
    page.wait_for_timeout(700)
    verdict = page.query_selector(".verdict")
    if verdict is None:
        return ""
    return "right" if verdict.inner_text().startswith("Right") else "wrong"


def has_pair(page):
    """True when the reveal on screen prints the two plates side by side.

    A typed card reveals as wrong with one plate, and a wrong choice on a card
    whose photo failed does the same. The reveal shot and the reveal audit both
    want the pair, so both ask for it here.
    """
    return page.query_selector(".reveal .pair") is not None


def wrong_pair(page, attempt):
    """Answer cards on this page until a wrong choice prints the pair.

    A card the deck asks as a typed card reveals with one plate, so this walks
    past it to the next card. Returns True on the pair, and False when the
    deck runs out first. Both loops are bounded, so the walk always ends.
    """
    for step in range(MAX_TRIES):
        verdict = answer(page, attempt + step)
        if verdict == "":
            return False
        if verdict == "wrong" and has_pair(page):
            return True
        next_button = page.query_selector(".reveal .btn")
        if next_button is None:
            return False
        next_button.click()
        page.wait_for_timeout(500)
    return False


def shoot(browser, name, frag, action, width, root, out):
    target = out / f"{name}-{width}-{root}.png"
    if action != "wrong":
        page = open_page(browser, width, root, frag, scale=2)
        try:
            page.screenshot(path=str(target), full_page=True)
        finally:
            page.close()
        return target
    # The reveal is only worth a shot in its wrong state: that is the one that
    # prints two plates side by side.
    for attempt in range(MAX_TRIES):
        page = open_page(browser, width, root, frag, scale=2)
        try:
            if wrong_pair(page, attempt):
                page.screenshot(path=str(target), full_page=True)
                return target
        finally:
            page.close()
    raise RuntimeError(f"no wrong answer with a pair in {MAX_TRIES} tries")


def main():
    out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "out/shots")
    out.mkdir(parents=True, exist_ok=True)
    failures = 0
    with sync_playwright() as play:
        browser = play.chromium.launch()
        for width in WIDTHS:
            for root in ROOTS:
                for name, frag, action in ROUTES:
                    try:
                        print(shoot(browser, name, frag, action, width, root, out))
                    except Exception as error:
                        failures += 1
                        print(f"FAIL {name}-{width}-{root}: {error}")
        browser.close()
    print(f"\n{failures} shots failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
