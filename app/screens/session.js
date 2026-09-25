// The quiz loop, the reveal, and the summary. Computes nothing: every value
// comes from a logic module.
import { unitFor, channelLabel } from '../logic/content.js';
import {
  buildSession, buildPlacementDeck, answerEffects, requeueCard,
  dueTomorrowCount, sessionPosition, emptyResults, accumulateAnswer
} from '../logic/session.js';
import {
  buildQuestion, buildReveal, invAvailable, answerPhoto
} from '../logic/question.js';
import { gradeChoice, gradeTyped, resolveTyped } from '../logic/grader.js';
import { deriveGrade } from '../logic/scheduler.js';
import { LEVEL_NAMES, cardLevel } from '../logic/progress.js';
import { el, link, srOnly } from '../ui/dom.js';
import { ramp } from '../ui/chrome.js';
import { plate, credit } from '../ui/plate.js';

// The caption on a question plate never names the tree.
const UNDETERMINED = 'Pressed specimen, undetermined.';

// The session the reader stepped out of, to read about one tree. Tapping the
// name on a reveal changes the route, and a route change tears this screen
// down, so the place the reader left is kept here, outside `render`. The
// history entry the reader comes back to carries the token that matches it.
// One slot is enough: only one session is on screen at a time.
let suspended = null;

let tokens = 0;
function newToken() {
  tokens += 1;
  return `${Date.now().toString(36)}-${tokens}`;
}

export function render(root, ctx) {
  const { content, store, today, image_base: imageBase } = ctx;
  const mode = ctx.mode ?? 'review';
  const focus = ctx.params.get('focus') ?? 'all';
  const chosenUnit = ctx.params.get('unit') || null;
  const userSettings = store.readSettings();

  // The history entry this render stands on. A fresh navigation carries no
  // state of this screen's. A back press from a species page restores the
  // state of the entry the session pushed, so the token on it matches the
  // session the reader stepped out of, and this render is that session coming
  // back rather than a new one. Anything else deals a new deck.
  const entry = typeof history.state === 'object' ? history.state : null;
  const returning = Boolean(suspended && entry && entry.dendro === 'session'
    && entry.guard === true && entry.token === suspended.token);
  const resumed = returning ? suspended : null;
  suspended = null;
  const token = resumed ? resumed.token : newToken();

  // A deck built again would not be the deck the reader left: the cards
  // answered so far are no longer due. So the session that comes back carries
  // its own deck, its own place in it, and its own tallies.
  const built = resumed
    ? null
    : (mode === 'placement'
      ? { card_ids: buildPlacementDeck(content), unit_key: null }
      : buildSession({
        content, states: store.readCards(), log: store.readLog(),
        settings: userSettings, today, focus, chosen_unit: chosenUnit
      }));
  const unit = built?.unit_key ? unitFor(content, built.unit_key) : null;
  const deck = resumed
    ? [...resumed.deck]
    : built.card_ids;
  const where = resumed
    ? resumed.where
    : (mode === 'placement' ? 'Placement test' : (unit?.name ?? 'Review'));

  const lastHash = resumed ? { ...resumed.last_hash } : {};
  const failedHashes = resumed ? { ...resumed.failed_hashes } : {};
  const requeuedOnce = new Set(resumed ? resumed.requeued : []);
  const answered = new Set(resumed ? resumed.answered : []);
  let results = resumed ? resumed.results : emptyResults();
  let index = resumed ? resumed.index : 0;
  // The counter names the card on screen. It is fixed when the card renders,
  // so the reveal keeps the number the question had, and a second render of
  // the same card, after a photo fails, keeps it too.
  let answerCount = resumed ? resumed.answer_count : 0;
  let shown = resumed ? resumed.shown : 0;
  // The view on screen right now, so Resume can paint it again without
  // sampling a new photo or a new set of options.
  let lastView = null;

  // Every render takes the next number. An image handler belongs to the
  // render that made it, so it does nothing once a later render has replaced
  // that one, and nothing once the router has called the teardown.
  let renderId = 0;
  let cancelled = false;
  const stale = (generation) => cancelled || generation !== renderId;

  // ---------- the back press ----------
  //
  // The session holds two history entries that carry its own hash: the entry
  // the navigation made, and one duplicate above it, both stamped with this
  // session's token. The pair goes on below, after the first paint. A back
  // press pops the duplicate, so the URL does not change, no hashchange
  // fires, and the router leaves this screen in place. Only popstate runs,
  // and it does what Leave does.
  //
  // `guardOn` says whether the duplicate is still up there. Every exit needs
  // that one fact: an exit with the duplicate still up has two entries with
  // the session's hash to clear, not one. See `leave`.
  let guardOn = Boolean(resumed);
  // The hash both of the session's entries carry.
  const ownHash = window.location.hash;
  // The leave summary is the last screen the session owns. A back press on it
  // goes home: repainting the summary would leave the back gesture dead.
  let leaveShowing = false;
  // Where the screen is going, once an exit is under way.
  let exitHash = null;
  let exitReload = false;

  function onPopState() {
    if (cancelled) return;
    // A tap on a link inside this screen is a same-document navigation, and
    // Chrome fires popstate for one, before the hashchange. Measured: the
    // species link on a reveal fires popstate with the species hash already
    // in place. This handler is only for the press that pops the duplicate,
    // which leaves the session's own hash where it was. Everything else is
    // the router's to answer, and answering it here is what used to cost the
    // reader a second back press.
    if (window.location.hash !== ownHash) return;
    // The press took the duplicate off, so the screen now stands on the
    // session's own entry.
    guardOn = false;
    if (exitHash) { finishExit(); return; }
    // Three states go home. On the leave summary the back gesture is the way
    // out. With no card answered there is nothing to sum up. Once the deck is
    // spent the screen is already the end-of-session summary, and a leave
    // summary over the top of it would read "the cards you have not reached
    // stay due" when none is unreached, and would hide the row for tomorrow's
    // count and the note about exporting.
    //
    // None of the three puts the duplicate back, so the entry the exit drops
    // is the session's own, and the reader leaves the session behind for
    // good.
    if (leaveShowing || answerCount === 0 || index >= deck.length) {
      leaveToHome();
      return;
    }
    // The leave summary keeps a duplicate above it, so the next back press is
    // the screen's to answer as well.
    history.pushState({ dendro: 'session', token, guard: true }, '', ownHash);
    guardOn = true;
    showLeaveSummary();
  }

  // `removeEventListener` on a listener that was never added does nothing, so
  // this is safe on the empty deck, which returns before the listener goes on.
  const teardown = () => {
    cancelled = true;
    window.removeEventListener('popstate', onPopState);
  };

  function warnIfUnsaved() {
    if (!store.available) ctx.banner(ctx.storage_banner);
  }

  if (deck.length === 0) {
    const placement = mode === 'placement';
    root.append(el('h1', 'display', placement ? 'No cards to place' : 'Nothing to study'));
    root.append(el('p', 'where2', placement
      ? 'The placement test needs level-1 concept cards, and this content set has none.'
      : 'Nothing is due in this focus, and no new card is ready for it today.'));
    root.append(link('#/', 'btn', 'Home'));
    return teardown;
  }

  // ---------- the running head and the printed gauge ----------

  function head(question) {
    const place = sessionPosition(shown, deck.length);
    const bar = el('div', 'head');
    const leave = el('button', 'leave', 'Leave');
    leave.type = 'button';
    leave.addEventListener('click', () => onLeave());
    bar.append(leave);
    bar.append(el('span', 'where',
      `${where}, ${channelLabel(question.channel)} card `
      + `${place.position} of ${place.total}`));
    root.append(bar);

    const gauge = el('div', 'gauge');
    gauge.setAttribute('aria-hidden', 'true');
    for (let i = 1; i <= place.total; i += 1) {
      if (i < place.position) gauge.append(el('i', 'done'));
      else if (i === place.position) gauge.append(el('i', 'now'));
      else gauge.append(el('i'));
    }
    root.append(gauge);
    root.append(srOnly(`Card ${place.position} of ${place.total}.`));
  }

  // ---------- the question ----------

  function excludedFor(cardId) {
    const failed = failedHashes[cardId] ?? [];
    return lastHash[cardId] ? [...failed, lastHash[cardId]] : [...failed];
  }

  function guessBox() {
    const label = el('label', 'guessed');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'guess_box';
    // The printed box sits after the input, so `input:checked ~ .box` inks it.
    label.append(input, el('span', 'box'), el('span', null, 'I guessed'));
    return { label, input };
  }

  function paintQuestion(question, card, generation, resumeElapsed = 0) {
    leaveShowing = false;
    root.textContent = '';
    head(question);

    // The answer clock. `deriveGrade` reads the elapsed time against the
    // format's own threshold, so a card painted again by Resume must carry
    // the time it already spent rather than start from zero.
    //
    // What crosses a Resume is the elapsed time, not the start time. The
    // clock is then rebased on the new paint, so the seconds the reader
    // spent on the leave summary do not count towards the answer. `lastView`
    // is set here, inside the closure, so it can read the clock.
    let startedAt = resumeElapsed ? Date.now() - resumeElapsed : 0;
    lastView = () => paintQuestion(
      question, card, (renderId += 1), startedAt ? Date.now() - startedAt : 0
    );

    const guess = guessBox();
    const submit = (chosenKey, typedText) => {
      const elapsed = startedAt ? Date.now() - startedAt : 0;
      answerCard(question, card, chosenKey, typedText, guess.input.checked, elapsed);
    };

    if (question.format === 'inv') {
      const grid = el('div', 'invkey');
      let pending = question.options.length;
      for (const option of question.options) {
        const button = el('button');
        button.type = 'button';
        // The session keeps its own failure handling, so it passes `onError`
        // rather than letting `plate` drop the figure on its own.
        const figure = plate(option.photo, {
          image_base: imageBase,
          alt: 'Option photo',
          shape: null,
          soft: true,
          onError: () => {
            if (stale(generation)) return;
            pending -= 1;
            if (option.key === question.answer_key) {
              console.warn(`Answer photo failed for ${card.id}. Skipping the card this session.`);
              index += 1;
              showCard();
              return;
            }
            button.remove();
            if (pending === 0 && !startedAt) startedAt = Date.now();
          }
        });
        const image = figure.querySelector('img');
        image.addEventListener('load', () => {
          if (stale(generation)) return;
          pending -= 1;
          if (pending === 0 && !startedAt) startedAt = Date.now();
        });
        button.append(figure);
        button.addEventListener('click', () => submit(option.key, ''));
        grid.append(button);
      }
      root.append(el('p', 'prompt', question.prompt));
      root.append(grid);
      root.append(guess.label);
      lastHash[card.id] = answerPhoto(question)?.hash ?? null;
      return;
    }

    const figure = plate(question.photo, {
      image_base: imageBase,
      alt: UNDETERMINED,
      shape: 'pl-hero',
      bleed: true,
      onError: () => {
        if (stale(generation)) return;
        failedHashes[card.id] = [...(failedHashes[card.id] ?? []), question.photo.hash];
        console.warn(`Image failed: img/${question.photo.hash}.jpg`);
        showCard();
      }
    });
    const image = figure.querySelector('img');
    image.addEventListener('load', () => {
      if (stale(generation)) return;
      // Resume paints this view again and the cached image fires load again.
      // The clock only starts once.
      if (!startedAt) startedAt = Date.now();
    });
    root.append(figure);
    root.append(credit(question.photo, UNDETERMINED));
    lastHash[card.id] = question.photo.hash;

    root.append(el('p', 'prompt', question.prompt));

    if (question.format === 'typed') {
      const form = el('div', 'typed');
      const field = document.createElement('input');
      field.type = 'text';
      field.id = 'typed_answer';
      field.autocomplete = 'off';
      field.setAttribute('aria-label', question.prompt);
      const go = el('button', 'btn', 'Answer');
      go.type = 'button';
      go.addEventListener('click', () => submit(null, field.value));
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submit(null, field.value);
      });
      form.append(field, go);
      root.append(form);
    } else {
      // The four labels share one width: common name at the left margin,
      // binomial ranged right, so the names line up the way an index does.
      const key = el('div', 'key');
      for (const option of question.options) {
        const button = el('button', 'pick');
        button.type = 'button';
        button.append(el('span', 'nm', option.label));
        if (option.sublabel) button.append(el('span', 'bn', option.sublabel));
        button.addEventListener('click', () => submit(option.key, ''));
        key.append(button);
      }
      root.append(key);
    }
    root.append(guess.label);
  }

  function showCard() {
    if (index >= deck.length) { showSummary(); return; }
    const cardId = deck[index];
    const card = content.cards[cardId];
    const state = mode === 'placement' ? null : store.readCards()[cardId];
    const question = buildQuestion({
      card, content, state, excluded_hashes: excludedFor(cardId)
    });

    // buildQuestion samples again with nothing excluded when the exclusion
    // list covers the whole pool, so it can hand back a photo that already
    // failed. The card waits for another session once every photo has failed.
    const failed = failedHashes[cardId] ?? [];
    const exhausted = question.format !== 'inv'
      && (!question.photo || card.photos.every((photo) => failed.includes(photo.hash)));
    if (exhausted) {
      console.warn(`Photo pool exhausted for ${cardId}. Skipping the card this session.`);
      index += 1;
      showCard();
      return;
    }

    const generation = (renderId += 1);
    shown = answerCount + 1;
    // `paintQuestion` sets `lastView` itself, because only it can see the
    // answer clock that Resume has to carry over.
    paintQuestion(question, card, generation);
  }

  // ---------- one answer ----------

  function answerCard(question, card, chosenKey, typedText, guessed, elapsedMs) {
    const correct = question.format === 'typed'
      ? gradeTyped(card, typedText, content)
      : gradeChoice(question.answer_key, chosenKey);
    const grade = deriveGrade({
      correct, guess: guessed, elapsed_ms: elapsedMs, format: question.format
    });
    const repeat = answered.has(card.id);
    answered.add(card.id);
    answerCount += 1;
    const before = store.readCards()[card.id];

    const effects = answerEffects({
      mode, repeat, correct, grade, before, today,
      inv_available: invAvailable(content, card),
      requeued: requeuedOnce.has(card.id)
    });

    if (effects.state) {
      store.writeCard(card.id, effects.state);
      warnIfUnsaved();
    }
    if (effects.log) {
      store.appendLog({
        card: card.id,
        at: new Date().toISOString(),
        day: today,
        grade,
        format: question.format,
        options: question.option_count,
        elapsed_ms: elapsedMs,
        answer: question.format === 'typed' ? typedText : chosenKey,
        interval_before: before?.interval ?? 0,
        ease_before: before?.ease ?? 2.5
      });
      warnIfUnsaved();
    }

    let revealKey = chosenKey;
    if (correct) revealKey = question.answer_key;
    else if (question.format === 'typed') {
      revealKey = resolveTyped(typedText, card.kind, card.channel, content);
    }
    const reveal = buildReveal({ question, chosen_key: revealKey, content });
    if (!repeat && reveal.missing_edge) {
      store.recordMissingEdge(reveal.missing_edge);
      warnIfUnsaved();
    }

    // Ruling R2: the tallies and the promoted list belong to the logic module.
    results = accumulateAnswer(results, {
      card_id: card.id,
      repeat,
      correct,
      before,
      after: effects.state,
      miss: correct ? null : {
        label: reveal.answer.label,
        chosen: reveal.chosen ? reveal.chosen.label : typedText,
        diagnostic: reveal.diagnostic ? reveal.diagnostic.text : ''
      }
    });

    if (effects.requeue) {
      requeuedOnce.add(card.id);
      deck.splice(0, deck.length, ...requeueCard(deck, index, card.id));
      index -= 1;
    }

    const levels = {
      before: before ? cardLevel(before) : 0,
      after: effects.state ? cardLevel(effects.state) : (before ? cardLevel(before) : 0)
    };
    lastView = () => paintReveal(question, reveal, typedText, correct, levels);
    paintReveal(question, reveal, typedText, correct, levels);
  }

  // ---------- the reveal ----------

  function levelLine(levels) {
    const row = el('div', 'levelrow');
    row.append(ramp(levels.after, { large: true, lost: levels.after < levels.before }));
    let text = `Level ${levels.after}, ${LEVEL_NAMES[levels.after]}`;
    if (levels.after > levels.before) text += `, up from ${levels.before}`;
    else if (levels.after < levels.before) text += `, down from ${levels.before}`;
    row.append(el('span', 'lv', `${text}.`));
    return row;
  }

  function paintReveal(question, reveal, typedText, correct, levels) {
    leaveShowing = false;
    renderId += 1;
    root.textContent = '';
    head(question);

    const panel = el('div', 'reveal');
    const verdictWrap = el('div', 'verdict-wrap');
    verdictWrap.append(el('p', 'verdict', correct ? 'Right.' : 'Not this one.'));
    const title = el('h1', 'display');
    if (question.kind === 'species') {
      const out = link(`#/species/${reveal.answer.key}`, 'answer-link', reveal.answer.label);
      // The reader is stepping out to read about this tree. Keep the place, so
      // one back press brings this reveal back rather than a fresh question.
      out.addEventListener('click', () => {
        suspend({
          question, reveal, typed_text: typedText, correct, levels
        });
      });
      title.append(out);
    } else {
      title.textContent = reveal.answer.label;
    }
    verdictWrap.append(title);
    if (reveal.answer.sublabel) {
      verdictWrap.append(el('p', 'sci-small', reveal.answer.sublabel));
    }
    panel.append(verdictWrap);

    if (!correct && reveal.chosen && reveal.chosen.photo && reveal.answer.photo) {
      const heads = el('div', 'pair-head');
      const right = el('span', 'ok');
      right.append(el('i'));
      right.append(document.createTextNode(`${reveal.answer.label}, correct`));
      const wrong = el('span', 'no');
      wrong.append(el('i'));
      wrong.append(el('b', null, reveal.chosen.label));
      wrong.append(document.createTextNode(', your pick'));
      heads.append(right, wrong);
      panel.append(heads);

      const pair = el('div', 'pair bleed');
      // A pair is a comparison. One plate of two is not a comparison, and the
      // default `onError` would put a line of prose into a two-column grid
      // beside a photograph. So either plate failing takes the pair and the
      // two labels above it, and leaves one printed line in their place.
      const dropPair = () => {
        if (!pair.isConnected) return;
        heads.remove();
        pair.replaceWith(el('p', 'fact-line',
          'The two plates for this pair did not load.'));
      };
      const a = plate(reveal.answer.photo, {
        image_base: imageBase, alt: `${reveal.answer.label}, the answer`,
        shape: 'pl-a', onError: dropPair
      });
      const b = plate(reveal.chosen.photo, {
        image_base: imageBase, alt: `${reveal.chosen.label}, your pick`,
        shape: 'pl-b', lift: true, onError: dropPair
      });
      pair.append(a, b);
      panel.append(pair);
    } else if (reveal.answer.photo) {
      panel.append(plate(reveal.answer.photo, {
        image_base: imageBase,
        alt: `${reveal.answer.label}, the answer`,
        shape: 'pl-leaf',
        bleed: true
      }));
      panel.append(credit(reveal.answer.photo));
    }

    if (!correct && question.format === 'typed') {
      panel.append(el('p', 'compare', `You typed: ${typedText}`));
    }
    if (reveal.diagnostic) {
      panel.append(el('p', 'compare', reveal.diagnostic.text));
      if (reveal.diagnostic.ref) panel.append(el('p', 'cap', reveal.diagnostic.ref));
    }

    panel.append(levelLine(levels));

    const next = el('button', 'btn', 'Next');
    next.type = 'button';
    next.addEventListener('click', () => { index += 1; showCard(); });
    panel.append(next);
    root.append(panel);
  }

  // ---------- the summary ----------

  function sumRow(key, value) {
    const row = el('div', 'sumrow');
    row.append(el('span', 'sk', key));
    row.append(el('span', 'sv', value));
    return row;
  }

  function missList() {
    const list = el('ul', 'misslist');
    for (const miss of results.misses) {
      list.append(el('li', null,
        `${miss.label} against ${miss.chosen}. ${miss.diagnostic}`));
    }
    return list;
  }

  function showSummary() {
    leaveShowing = false;
    renderId += 1;
    lastView = null;
    root.textContent = '';
    root.append(el('h1', 'display', 'Session done'));
    root.append(sumRow('right', String(results.right)));
    root.append(sumRow('missed', String(results.missed)));
    root.append(sumRow('promoted', String(results.promoted.length)));
    root.append(sumRow('demoted', String(results.demoted.length)));
    root.append(sumRow('due tomorrow',
      String(dueTomorrowCount(store.readCards(), today))));

    if (results.misses.length) {
      root.append(el('div', 'tick'));
      root.append(el('h2', 'sec-h', 'The ones you missed'));
      root.append(missList());
    }

    if (!store.available) {
      root.append(el('p', 'note',
        'This browser blocks local storage, so nothing was saved. Open Settings '
        + 'and export before you close the tab.'));
    } else if (store.shouldPromptExport(today)) {
      root.append(el('p', 'note',
        'It has been a month since your last export. Open Settings and export '
        + 'your progress.'));
    }

    const row = el('div', 'btnrow');
    const again = el('button', 'btn', 'Another session');
    again.type = 'button';
    // A fresh deck needs a fresh boot. The session that is over goes out of
    // the history first, the same way every other exit does, so a back press
    // from the new session does not land on the old one.
    again.addEventListener('click', () => {
      leave(`#/session?focus=${focus}${chosenUnit ? `&unit=${chosenUnit}` : ''}`, true);
    });
    row.append(again);
    // Home is a button, not an anchor: an anchor would push an entry on top
    // of the session's own, and the back press from home would open the spent
    // session again.
    const home = el('button', 'btn ghost', 'Home');
    home.type = 'button';
    home.addEventListener('click', () => leaveToHome());
    row.append(home);
    root.append(row);
  }

  // ---------- leaving ----------

  // Stepping out to a species page, with the place kept. The route change
  // tears this screen down, so the snapshot lives outside `render` and the
  // token on the history entry is what matches it back up. Copies, not the
  // live objects, so the session the reader comes back to is the session the
  // reader left.
  function suspend(view) {
    suspended = {
      token,
      where,
      deck: [...deck],
      index,
      answer_count: answerCount,
      shown,
      results,
      answered: [...answered],
      requeued: [...requeuedOnce],
      last_hash: { ...lastHash },
      failed_hashes: { ...failedHashes },
      view
    };
  }

  // Every way out of the session lands here.
  //
  // The screen stands on its own duplicate entry until a back press takes it
  // off, and both of its entries carry the session's hash. A replace on the
  // duplicate would leave the entry below it, so the next back press would
  // open a fresh session on a spent deck. So the duplicate goes first, by a
  // back press the screen makes itself, and `onPopState` finishes the exit
  // with the replace landing on the session's own entry. Nothing with the
  // session's hash is left behind.
  //
  // A replace fires no `hashchange`, so the router is told by hand.
  function leave(hash, reload = false) {
    suspended = null;
    exitHash = hash;
    exitReload = reload;
    if (guardOn) {
      guardOn = false;
      history.back();
      return;
    }
    finishExit();
  }

  function finishExit() {
    history.replaceState({ dendro: 'left' }, '', exitHash);
    if (exitReload) {
      window.location.reload();
      return;
    }
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  function leaveToHome() {
    leave('#/');
  }

  function showLeaveSummary() {
    leaveShowing = true;
    renderId += 1;
    root.textContent = '';
    root.append(el('h1', 'display', 'Where you got to'));
    const done = results.right + results.missed;
    // The claim that the answers are saved is only true when the store takes
    // writes. A browser that blocks local storage gets the same note the
    // end-of-session summary prints.
    root.append(el('p', 'where2',
      `${done} of ${deck.length} cards answered.`
      + `${store.available ? ' Every answer is already saved.' : ''}`
      + ' The cards you have not reached stay due.'));
    root.append(sumRow('right', String(results.right)));
    root.append(sumRow('missed', String(results.missed)));
    root.append(sumRow('promoted', String(results.promoted.length)));
    root.append(sumRow('demoted', String(results.demoted.length)));

    if (results.misses.length) {
      root.append(el('div', 'tick'));
      root.append(el('h2', 'sec-h', 'The ones you missed'));
      root.append(missList());
    }

    if (!store.available) {
      root.append(el('p', 'note',
        'This browser blocks local storage, so nothing was saved. Open Settings '
        + 'and export before you close the tab.'));
    }

    const row = el('div', 'btnrow');
    const resume = el('button', 'btn', 'Resume');
    resume.type = 'button';
    resume.addEventListener('click', () => {
      if (lastView) lastView();
      else showCard();
    });
    row.append(resume);
    const home = el('button', 'btn ghost', 'Home');
    home.type = 'button';
    home.addEventListener('click', () => leaveToHome());
    row.append(home);
    root.append(row);
  }

  // With no card answered there is nothing to sum up, so Leave goes home at
  // once.
  function onLeave() {
    if (answerCount === 0) { leaveToHome(); return; }
    showLeaveSummary();
  }

  // A session that is coming back opens on the view the reader left, built
  // from the snapshot. Anything else deals the first card.
  if (resumed && resumed.view) {
    const view = resumed.view;
    lastView = () => paintReveal(
      view.question, view.reveal, view.typed_text, view.correct, view.levels
    );
    lastView();
  } else {
    showCard();
  }

  // The duplicate entry and the listener go on only once the first paint is
  // through. A throw in that paint leaves `render` without returning the
  // teardown, so `main.js` paints the error panel and holds no way to take
  // the listener off again; the listener would then answer every back press
  // in the app for the rest of the visit, and the duplicate would be an entry
  // nothing ever takes off.
  //
  // A session that is coming back already stands on its own duplicate, with
  // its own entry below, so it pushes nothing.
  if (!resumed) {
    history.replaceState({ dendro: 'session', token, guard: false }, '', ownHash);
    history.pushState({ dendro: 'session', token, guard: true }, '', ownHash);
    guardOn = true;
  }
  window.addEventListener('popstate', onPopState);
  return teardown;
}
