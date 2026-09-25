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

export function render(root, ctx) {
  const { content, store, today, image_base: imageBase } = ctx;
  const mode = ctx.mode ?? 'review';
  const focus = ctx.params.get('focus') ?? 'all';
  const chosenUnit = ctx.params.get('unit') || null;
  const userSettings = store.readSettings();

  const built = mode === 'placement'
    ? { card_ids: buildPlacementDeck(content), unit_key: null }
    : buildSession({
      content, states: store.readCards(), log: store.readLog(),
      settings: userSettings, today, focus, chosen_unit: chosenUnit
    });
  const deck = built.card_ids;
  const unit = built.unit_key ? unitFor(content, built.unit_key) : null;
  const where = mode === 'placement' ? 'Placement test' : (unit?.name ?? 'Review');

  const lastHash = {};
  const failedHashes = {};
  const requeuedOnce = new Set();
  const answered = new Set();
  let results = emptyResults();
  let index = 0;
  // The counter names the card on screen. It is fixed when the card renders,
  // so the reveal keeps the number the question had, and a second render of
  // the same card, after a photo fails, keeps it too.
  let answerCount = 0;
  let shown = 0;
  // The view on screen right now, so Resume can paint it again without
  // sampling a new photo or a new set of options.
  let lastView = null;

  // Every render takes the next number. An image handler belongs to the
  // render that made it, so it does nothing once a later render has replaced
  // that one, and nothing once the router has called the teardown.
  let renderId = 0;
  let cancelled = false;
  const stale = (generation) => cancelled || generation !== renderId;

  // The back press. One extra history entry, a duplicate of this screen's own
  // hash, goes on below the empty-deck branch. A back press pops that
  // duplicate, so the URL does not change, no hashchange fires, and the
  // router leaves this screen in place. Only popstate runs, and it does what
  // Leave does. The handler pushes the duplicate again, so the next back
  // press behaves the same way.
  function onPopState() {
    if (cancelled) return;
    if (answerCount === 0) { leaveToHome(); return; }
    history.pushState({ dendro: 'session' }, '', window.location.hash);
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

  // The deck holds at least one card, so the screen is going to stay. Push a
  // duplicate of this hash for the back press to pop.
  history.pushState({ dendro: 'session' }, '', window.location.hash);
  window.addEventListener('popstate', onPopState);

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
    renderId += 1;
    root.textContent = '';
    head(question);

    const panel = el('div', 'reveal');
    const verdictWrap = el('div', 'verdict-wrap');
    verdictWrap.append(el('p', 'verdict', correct ? 'Right.' : 'Not this one.'));
    const title = el('h1', 'display');
    if (question.kind === 'species') {
      title.append(link(`#/species/${reveal.answer.key}`, 'answer-link', reveal.answer.label));
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
    again.addEventListener('click', () => {
      ctx.navigate(`/session?focus=${focus}${chosenUnit ? `&unit=${chosenUnit}` : ''}`);
      window.location.reload();
    });
    row.append(again);
    row.append(link('#/', 'btn ghost', 'Home'));
    root.append(row);
  }

  // ---------- leaving ----------

  // Home, without leaving the session in the history. `navigate` would push a
  // new entry on top of the one the back press just took off, so a second
  // back press would come straight back into a session that is over. A
  // replace drops that entry instead. A replace fires no `hashchange`, so
  // the router is told by hand.
  function leaveToHome() {
    history.replaceState({ dendro: 'left' }, '', '#/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  function showLeaveSummary() {
    renderId += 1;
    root.textContent = '';
    root.append(el('h1', 'display', 'Where you got to'));
    const done = results.right + results.missed;
    root.append(el('p', 'where2',
      `${done} of ${deck.length} cards answered. Every answer is already saved. `
      + 'The cards you have not reached stay due.'));
    root.append(sumRow('right', String(results.right)));
    root.append(sumRow('missed', String(results.missed)));
    root.append(sumRow('promoted', String(results.promoted.length)));
    root.append(sumRow('demoted', String(results.demoted.length)));

    if (results.misses.length) {
      root.append(el('div', 'tick'));
      root.append(el('h2', 'sec-h', 'The ones you missed'));
      root.append(missList());
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
  // once. The browser's back button lands here too.
  function onLeave() {
    if (answerCount === 0) { leaveToHome(); return; }
    showLeaveSummary();
  }

  showCard();
  return teardown;
}
