"""Screenshot every Dendro screen at both phone widths and all three root sizes.

Usage:
    python -m http.server 8000                 # one terminal, at the repo root
    python scripts/shots.py out/shots          # another terminal

Writes <out>/<screen>-<width>-<root>.png: one file per route per width per
root size. A developer tool, not a CI step: CI has no browser and no server.

Set DENDRO_BASE when the server is on another port, for example
    DENDRO_BASE=http://localhost:8011/?content=dev

Every run draws the same screens. The page gets a seeded random number
generator before the app boots, a seeded store of card levels, and, on a
session route, a walk down the deck until the card is asked in the format the
route names. Each route also names a selector it must print, so a route that
silently falls back to another screen is reported rather than shot.

A route that fails is reported and skipped. One screen that will not open
must not cost the other shots.
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = os.environ.get("DENDRO_BASE", "http://localhost:8000/?content=dev")
WIDTHS = [360, 390]
ROOTS = ["80", "100", "130"]

# name, hash, what to do once the page has loaded, the selector the route must
# print. The action is one of:
#   None      shoot the page as it stands
#   "pick"    walk the deck to a card asked as a list of names, then shoot
#   "typed"   walk the deck to a card asked as a text field, then shoot
#   "inv"     walk the deck to a card asked as a grid of photos, then shoot
#   "wrong"   answer a card with something that is not the answer, then shoot
ROUTES = [
    ("home", "#/", None, ".masthead .display"),
    ("lessons", "#/lessons", None, ".chdoor"),
    ("lessons-leaf", "#/lessons/leaf", None, ".tree .urow"),
    ("progress", "#/progress", None, ".chblock .rung"),
    ("progress-shape", "#/progress/leaf/simple_lobed", None, ".strip"),
    ("species", "#/species/QURU", None, ".sp-title"),
    ("settings", "#/settings", None, ".tsteps .tstep"),
    ("session", "#/session?focus=leaf&unit=leaf_types", "pick", ".key .pick"),
    ("session-typed", "#/session?focus=all", "typed", ".typed input"),
    ("session-inv", "#/session?focus=leaf", "inv", ".invkey button"),
    ("reveal", "#/session?focus=leaf&unit=leaf_types", "wrong", ".reveal .pair"),
]

# How many fresh pages the reveal may try, and how many cards it answers on
# each page. Every loop in this file is bounded, so no walk runs on for ever.
MAX_TRIES = 6

# How far `advance_to` may walk down the deck: the default session size.
MAX_WALK = 20

# What each answer format prints. The session routes walk the deck until one
# of these is on screen.
FORMAT_SELECTORS = {
    "pick": ".key .pick",
    "typed": ".typed input",
    "inv": ".invkey button",
}

# The app shuffles the deck, the answer labels, and the photo it samples with
# `Math.random`. A run that draws different cards each time cannot be compared
# with the run before it, so the page gets a generator with a fixed seed
# before any app script runs. This is mulberry32: short, and the same numbers
# in the same order every time.
RNG_JS = """
(() => {
  let state = 0x9E3779B9;
  Math.random = () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
"""

# Every screen draws from the stored card levels: the rungs and the bands on
# progress, the squares on lessons and species, the deck of the session. An
# empty store prints an empty app, so each page is seeded before it is shot.
# The seed reads the same content the app reads and derives the same card ids.
#
# The tier a card holds is what picks its answer format, so the seed also
# decides which formats the deck can deal. The cards take new, mc4, mc8,
# typed, and inv in turn, in card id order. A card can be asked as a grid of
# photos only when it has four photo options. A card whose turn is inv and
# that has fewer takes mc8. That keeps a spread of levels on every rung and
# puts every answer format in reach of every session route.
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
  const content = await import('/app/logic/content.js');
  const question = await import('/app/logic/question.js');
  const result = content.loadContent(raw);
  if (!result.ok) throw new Error('the content did not validate');

  // The local date, the way the app writes it.
  const today = new Date().toLocaleDateString('en-CA');

  // Only a card that is due today can be dealt into a session, so every tier
  // here is due today. The one card in four that stays new is what keeps a
  // level 0 on the rungs.
  const table = [
    null,
    { tier: 'mc4', tier_passes: 0, due: today, interval: 1, reps: 1 },
    { tier: 'mc8', tier_passes: 0, due: today, interval: 9, reps: 4 },
    { tier: 'typed', tier_passes: 2, due: today, interval: 40, reps: 11 }
  ];
  const inverted = { tier: 'inv', tier_passes: 0, due: today, interval: 25, reps: 7 };

  const state = (seed) => ({
    interval: seed.interval, ease: 2.5, due: seed.due, reps: seed.reps,
    lapses: 0, recent: ['good'], tier: seed.tier, tier_passes: seed.tier_passes
  });

  const cards = {};
  let slot = 0;
  for (const id of Object.keys(result.content.cards).sort()) {
    const card = result.content.cards[id];
    const cycle = [...table, inverted];
    let seed = cycle[slot % cycle.length];
    slot += 1;
    if (seed === inverted && !question.invAvailable(result.content, card)) seed = table[2];
    if (seed) cards[id] = state(seed);
  }
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
    # A page that never opens must not stay open. Without this a dead server
    # would leave one page behind for every route in the sweep.
    try:
        page.add_init_script(RNG_JS)
        # The store is read at boot, so the seed goes in on a first load and
        # the route is opened again on top of it.
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        page.evaluate(SEED_JS)
        page.goto(BASE + frag)
        page.reload()
        page.wait_for_load_state("networkidle")
        page.evaluate("s => document.documentElement.style.fontSize = s", root + "%")
        page.wait_for_timeout(600)  # let the webfonts and the plates settle
    except Exception:
        page.close()
        raise
    return page


def require(page, must, name):
    """Raise unless the screen on show is the one the route asked for.

    A hash the router does not know prints Home, and a screen that threw on
    its way in prints nothing. Both would otherwise pass every check on this
    page, because there is nothing wrong with an empty screen.
    """
    if page.query_selector("#app *") is None:
        raise RuntimeError(f"{name}: #app is empty")
    if page.query_selector(must) is None:
        raise RuntimeError(f"{name}: the screen printed no {must}")


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


def next_card(page):
    """Leave the reveal on screen and ask for the next card. True on success."""
    button = page.query_selector(".reveal .btn")
    if button is None:
        return False
    button.click()
    page.wait_for_timeout(500)
    return True


def has_pair(page):
    """True when the reveal on screen prints the two plates side by side.

    A typed card reveals as wrong with one plate, and a wrong choice on a card
    whose photo failed does the same. The reveal shot and the reveal audit both
    want the pair, so both ask for it here.
    """
    return page.query_selector(".reveal .pair") is not None


def advance_to(page, want):
    """Walk the deck until the card on screen is asked in the wanted format.

    The deck holds cards at three tiers, so the card it deals first is not
    always the format a route wants. Answering a card and pressing Next is the
    only way past it. Returns True on the wanted format, False when the deck
    runs out or the walk reaches its bound.
    """
    selector = FORMAT_SELECTORS[want]
    for _ in range(MAX_WALK):
        if page.query_selector(selector) is not None:
            return True
        if answer(page, 0) == "":
            return False
        if not next_card(page):
            return False
    return page.query_selector(selector) is not None


def wrong_pair(page, attempt):
    """Answer cards on this page until a wrong choice prints the pair.

    A card the deck asks as a typed card reveals with one plate, so this walks
    past it to the next card. Returns True on the pair, and False when the
    deck runs out first. Both loops are bounded, so the walk always ends.
    """
    for _ in range(MAX_TRIES):
        verdict = answer(page, attempt)
        if verdict == "":
            return False
        if verdict == "wrong" and has_pair(page):
            return True
        if not next_card(page):
            return False
    return False


def reach(page, action, attempt):
    """Bring the page to the state the route names. True when it is there."""
    if action is None:
        return True
    if action == "wrong":
        return wrong_pair(page, attempt)
    return advance_to(page, action)


def shoot(browser, name, frag, action, must, width, root, out):
    target = out / f"{name}-{width}-{root}.png"
    # The reveal is only worth a shot in its wrong state: that is the one that
    # prints two plates side by side. A fresh page reshuffles nothing, because
    # the generator is seeded, so only `attempt` changes what is clicked.
    tries = MAX_TRIES if action == "wrong" else 1
    for attempt in range(tries):
        page = open_page(browser, width, root, frag, scale=2)
        try:
            if not reach(page, action, attempt):
                continue
            require(page, must, name)
            page.screenshot(path=str(target), full_page=True)
            return target
        finally:
            page.close()
    raise RuntimeError(f"no {action} state in {tries} tries")


def main():
    out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "out/shots")
    out.mkdir(parents=True, exist_ok=True)
    failures = 0
    with sync_playwright() as play:
        browser = play.chromium.launch()
        for width in WIDTHS:
            for root in ROOTS:
                for name, frag, action, must in ROUTES:
                    try:
                        print(shoot(browser, name, frag, action, must, width, root, out))
                    except Exception as error:
                        failures += 1
                        print(f"FAIL {name}-{width}-{root}: {error}")
        browser.close()
    print(f"\n{failures} shots failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
