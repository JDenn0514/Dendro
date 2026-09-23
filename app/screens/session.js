// The quiz loop and the summary. Computes nothing: every value comes from a logic module.
import { imageUrl } from '../logic/content.js';
import {
  buildSession, buildPlacementDeck, answerEffects, requeueCard,
  dueTomorrowCount, sessionPosition, emptyResults, accumulateAnswer
} from '../logic/session.js';
import {
  buildQuestion, buildReveal, invAvailable, answerPhoto
} from '../logic/question.js';
import { gradeChoice, gradeTyped, resolveTyped } from '../logic/grader.js';
import { deriveGrade } from '../logic/scheduler.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The author links to the photo's origin page, so the credit reaches the source.
function creditInto(node, photo) {
  if (photo.origin) {
    const link = el('a', null, photo.author);
    link.href = photo.origin;
    link.target = '_blank';
    link.rel = 'noopener';
    node.append(link);
  } else {
    node.append(document.createTextNode(photo.author));
  }
  node.append(document.createTextNode(`, ${photo.source}, ${photo.license}.`));
  return node;
}

export function render(root, ctx) {
  const { content, store, today, image_base: imageBase } = ctx;
  const mode = ctx.mode ?? 'review';
  const focus = ctx.params.get('focus') ?? 'all';
  const chosenUnit = ctx.params.get('unit') || null;
  const userSettings = store.readSettings();

  const deck = mode === 'placement'
    ? buildPlacementDeck(content)
    : buildSession({
      content, states: store.readCards(), log: store.readLog(),
      settings: userSettings, today, focus, chosen_unit: chosenUnit
    }).card_ids;

  const totalPlanned = deck.length;
  const lastHash = {};
  const failedHashes = {};
  const requeuedOnce = new Set();
  const answered = new Set();
  let results = emptyResults();
  let index = 0;
  // The counter names the card on screen. It is fixed when the card renders, so
  // the reveal keeps the number the question had, and a second render of the
  // same card, after a photo fails, keeps it too.
  let answerCount = 0;
  let shown = 0;

  // Every render takes the next number. An image handler belongs to the render
  // that made it, so it does nothing once a later render has replaced that one,
  // and nothing once the router has called the teardown.
  let renderId = 0;
  let cancelled = false;
  const teardown = () => { cancelled = true; };
  const stale = (generation) => cancelled || generation !== renderId;

  function warnIfUnsaved() {
    if (!store.available) ctx.banner(ctx.storage_banner);
  }

  if (totalPlanned === 0) {
    const placement = mode === 'placement';
    root.append(el('h1', null, placement ? 'No cards to place' : 'Nothing to study'));
    root.append(el('p', null, placement
      ? 'The placement test needs level-1 concept cards, and this content set has none.'
      : 'Nothing is due in this focus and the daily new-card cap is reached.'));
    const back = el('button', 'primary', 'Home');
    back.addEventListener('click', () => ctx.navigate('/'));
    root.append(back);
    return teardown;
  }

  function excludedFor(cardId) {
    const failed = failedHashes[cardId] ?? [];
    return lastHash[cardId] ? [...failed, lastHash[cardId]] : [...failed];
  }

  function answerCard(question, card, chosenKey, typedText, guess, elapsedMs) {
    const correct = question.format === 'typed'
      ? gradeTyped(card, typedText, content)
      : gradeChoice(question.answer_key, chosenKey);
    const grade = deriveGrade({
      correct, guess, elapsed_ms: elapsedMs, format: question.format
    });
    const repeat = answered.has(card.id);
    answered.add(card.id);
    answerCount += 1;
    const before = store.readCards()[card.id];

    const effects = answerEffects({
      mode,
      repeat,
      correct,
      grade,
      before,
      today,
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
    showReveal(question, reveal, typedText, correct);
  }

  function showReveal(question, reveal, typedText, correct) {
    renderId += 1;
    root.textContent = '';
    header(question);
    root.append(el('h2', null, correct ? 'Right' : 'Wrong'));

    const pair = el('div', 'photo-pair');
    pair.append(photoBlock(reveal.answer.photo, `${reveal.answer.label} (the answer)`));
    if (!correct && reveal.chosen && reveal.chosen.photo) {
      pair.append(photoBlock(reveal.chosen.photo, `${reveal.chosen.label} (you picked)`));
    }
    root.append(pair);

    if (!correct && question.format === 'typed') {
      root.append(el('p', null, `You typed: ${typedText}`));
    }
    if (reveal.diagnostic) {
      root.append(el('p', 'notice', reveal.diagnostic.text));
      if (reveal.diagnostic.ref) root.append(el('p', 'attribution', reveal.diagnostic.ref));
    }

    root.append(el('p', null, reveal.answer.label));
    if (reveal.answer.sublabel) root.append(el('p', 'option-sub', reveal.answer.sublabel));
    const facts = reveal.answer.facts;
    if (facts.range_text) {
      root.append(el('p', null, facts.range_text));
      // A species record may carry no elevation and no height, so guard each one.
      const sizes = [];
      if (facts.elevation_ft) {
        sizes.push(`Elevation ${facts.elevation_ft[0]} to ${facts.elevation_ft[1]} ft.`);
      }
      if (facts.height_ft) {
        sizes.push(`Height ${facts.height_ft[0]} to ${facts.height_ft[1]} ft.`);
      }
      if (sizes.length) root.append(el('p', null, sizes.join(' ')));
      root.append(el('p', null, facts.habitat));
    } else if (facts.description) {
      root.append(el('p', null, facts.description));
    }

    const next = el('button', 'primary', 'Next');
    next.addEventListener('click', () => { index += 1; showCard(); });
    root.append(next);
  }

  function photoBlock(photo, caption) {
    const box = el('figure', null);
    if (photo) {
      const img = document.createElement('img');
      img.className = 'photo';
      img.src = imageUrl(photo, imageBase);
      img.alt = caption;
      box.append(img);
      box.append(creditInto(el('figcaption', 'attribution', `${caption}. `), photo));
    } else {
      box.append(el('p', 'attribution', `${caption}. No photo.`));
    }
    return box;
  }

  // A re-queued card does not add to the total, so sessionPosition clamps the counter.
  function header(question) {
    const place = sessionPosition(shown, deck.length);
    const bar = el('div', 'progress-bar');
    const fill = el('div');
    fill.style.width = `${place.percent}%`;
    bar.append(fill);
    root.append(el('p', null, `Card ${place.position} of ${place.total}`));
    root.append(bar);
    const line = el('p', null, question.prompt);
    line.append(document.createTextNode(' '));
    line.append(el('span', 'chip', question.format));
    root.append(line);
  }

  function showCard() {
    if (index >= deck.length) { showSummary(); return; }
    const cardId = deck[index];
    const card = content.cards[cardId];
    const state = mode === 'placement' ? null : store.readCards()[cardId];
    const question = buildQuestion({
      card, content, state, excluded_hashes: excludedFor(cardId)
    });

    // buildQuestion samples again with nothing excluded when the exclusion list
    // covers the whole pool, so it can hand back a photo that already failed.
    // The card waits for another session once every photo in its pool has failed.
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
    root.textContent = '';
    header(question);

    let startedAt = 0;
    const guessBox = document.createElement('input');
    guessBox.type = 'checkbox';
    guessBox.id = 'guess_box';
    const guessLabel = el('label', null, ' I guessed');
    guessLabel.prepend(guessBox);

    const answerArea = el('div', 'answer-area');

    const submit = (chosenKey, typedText) => {
      const elapsed = startedAt ? Date.now() - startedAt : 0;
      answerCard(question, card, chosenKey, typedText, guessBox.checked, elapsed);
    };

    if (question.format === 'inv') {
      const list = el('div', 'options inv');
      let pending = question.options.length;
      for (const option of question.options) {
        const button = el('button', null);
        const img = document.createElement('img');
        img.src = imageUrl(option.photo, imageBase);
        img.alt = 'Option photo';
        img.addEventListener('load', () => {
          if (stale(generation)) return;
          pending -= 1;
          if (pending === 0 && !startedAt) startedAt = Date.now();
        });
        img.addEventListener('error', () => {
          if (stale(generation)) return;
          pending -= 1;
          if (option.key === question.answer_key) {
            console.warn(`Answer photo failed for ${cardId}. Skipping the card this session.`);
            index += 1;
            showCard();
            return;
          }
          button.remove();
          if (pending === 0 && !startedAt) startedAt = Date.now();
        });
        button.append(img);
        button.addEventListener('click', () => submit(option.key, ''));
        list.append(button);
      }
      root.append(list);
      root.append(guessLabel);
      lastHash[cardId] = answerPhoto(question)?.hash ?? null;
    } else {
      const img = document.createElement('img');
      img.className = 'photo';
      img.src = imageUrl(question.photo, imageBase);
      img.alt = question.prompt;
      img.addEventListener('load', () => {
        if (stale(generation)) return;
        startedAt = Date.now();
      });
      img.addEventListener('error', () => {
        if (stale(generation)) return;
        failedHashes[cardId] = [...(failedHashes[cardId] ?? []), question.photo.hash];
        console.warn(`Image failed: img/${question.photo.hash}.jpg`);
        showCard();
      });
      root.append(img);
      root.append(creditInto(el('p', 'attribution'), question.photo));
      lastHash[cardId] = question.photo.hash;

      if (question.format === 'typed') {
        const field = document.createElement('input');
        field.type = 'text';
        field.id = 'typed_answer';
        field.autocomplete = 'off';
        const go = el('button', 'primary', 'Answer');
        go.addEventListener('click', () => submit(null, field.value));
        field.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') submit(null, field.value);
        });
        answerArea.append(field, go);
      } else {
        const list = el('div', 'options');
        for (const option of question.options) {
          const button = el('button', null, option.label);
          if (option.sublabel) button.append(el('span', 'option-sub', option.sublabel));
          button.addEventListener('click', () => submit(option.key, ''));
          list.append(button);
        }
        answerArea.append(list);
      }
      root.append(answerArea);
      root.append(guessLabel);
    }
  }

  function showSummary() {
    renderId += 1;
    root.textContent = '';
    root.append(el('h1', null, 'Session summary'));
    root.append(el('p', null, `Right: ${results.right}. Missed: ${results.missed}.`));

    root.append(el('p', null,
      `Due tomorrow: ${dueTomorrowCount(store.readCards(), today)}.`));

    const name = (id) => content.cards[id] ? `${content.cards[id].kind} ${content.cards[id].key} (${content.cards[id].channel})` : id;
    root.append(el('p', null,
      `Promoted: ${results.promoted.length ? results.promoted.map(name).join(', ') : 'none'}.`));
    root.append(el('p', null,
      `Demoted: ${results.demoted.length ? results.demoted.map(name).join(', ') : 'none'}.`));

    if (results.misses.length) {
      root.append(el('h2', null, 'Missed cards'));
      const list = el('ul');
      for (const miss of results.misses) {
        list.append(el('li', null, `${miss.label} against ${miss.chosen}. ${miss.diagnostic}`));
      }
      root.append(list);
    }

    if (!store.available) {
      root.append(el('p', 'notice',
        'This browser blocks local storage, so nothing was saved. Open Settings and export before you close the tab.'));
    } else if (store.shouldPromptExport(today)) {
      root.append(el('p', 'notice',
        'It has been a month since your last export. Open Settings and export your progress.'));
    }

    const again = el('button', 'primary', 'Another session');
    again.addEventListener('click', () => {
      ctx.navigate(`/session?focus=${focus}${chosenUnit ? `&unit=${chosenUnit}` : ''}`);
      window.location.reload();
    });
    const home = el('button', null, 'Home');
    home.addEventListener('click', () => ctx.navigate('/'));
    root.append(again, home);
  }

  showCard();
  return teardown;
}
