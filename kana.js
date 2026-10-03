import {kanaRows, katakana} from './legacy-data.js';

const rowNames = ['母音', 'か行', 'さ行', 'た行', 'な行', 'は行', 'ま行', 'や行', 'ら行', 'わ行', 'ん', 'が行・濁音', 'ざ行・濁音', 'だ行・濁音', 'ば行・濁音', 'ぱ行・半濁音'];
const rowWords = [
  ['あお', 'ao', '藍色'], ['かき', 'kaki', '柿子'], ['すし', 'sushi', '壽司'], ['たこ', 'tako', '章魚'],
  ['ねこ', 'neko', '貓'], ['はは', 'haha', '自己的母親'], ['まめ', 'mame', '豆子'], ['やま', 'yama', '山'],
  ['そら', 'sora', '天空'], ['わに', 'wani', '鱷魚'], ['ほん', 'hon', '書'], ['かぎ', 'kagi', '鑰匙'],
  ['かぜ', 'kaze', '風'], ['うで', 'ude', '手臂'], ['かべ', 'kabe', '牆壁'], ['ぱん', 'pan', '麵包（通常寫成片假名）']
];
const voicedBases = {11: 1, 12: 2, 13: 3, 14: 5, 15: 5};
const item = (kana, rom, meaning = '') => ({kana, rom, meaning});
const scriptName = script => script === 'kata' ? '片假名' : '平假名';
const convert = (value, script) => script === 'kata' ? katakana(value) : value;
const specialUnits = script => {
  const kata = script === 'kata';
  const longItems = kata
    ? [item('ビル', 'biru', '大樓'), item('ビール', 'biiru', '啤酒'), item('コーヒー', 'koohii', '咖啡')]
    : [item('おばさん', 'obasan', '阿姨'), item('おばあさん', 'obaasan', '奶奶'), item('とり', 'tori', '鳥'), item('とおり', 'toori', '街道'), item('こうこう', 'koukou', '高中')];
  const geminate = [item(convert('きて', script), 'kite', '請來'), item(convert('きって', script), 'kitte', '郵票')];
  const contracted = [item(convert('びょういん', script), 'byouin', '醫院'), item(convert('びよういん', script), 'biyouin', '美容院'), item(convert('きゃ', script), 'kya', '一拍的拗音'), item(convert('きや', script), 'kiya', '兩拍的字形對照，不是單字'), item(convert('きゅ', script), 'kyu', '一拍的拗音'), item(convert('きょ', script), 'kyo', '一拍的拗音')];
  const rewrite = kata ? '本單元把對比詞改寫為片假名，方便比較字形；平常多用漢字或平假名書寫。' : '';
  return [
    {key: 'long', title: '長音・多留一拍', category: '長音', note: kata ? '「ー」讓前面的母音多留一拍。ビル（兩拍）與ビール（三拍）意思不同；コーヒー有四拍。' : '長音要多留一拍：おばさん／おばあさん、とり／とおり。平假名通常用母音延長；「こうこう」的兩個「おう」各讀成長的 o。', items: longItems, words: [longItems[1], ...(kata ? [longItems[2]] : [longItems[4]])]},
    {key: 'sokuon', title: '促音・空出一拍', category: '促音', note: `小「${convert('っ', script)}」占一拍，先擋住氣流，再接下一個子音；它不讀 tsu。「${convert('きて', script)}」兩拍，「${convert('きって', script)}」三拍。${rewrite}`, items: geminate, words: [geminate[1]]},
    {key: 'yoon', title: '拗音・合成一拍', category: '拗音', note: `小「${convert('ゃ・ゅ・ょ', script)}」接在 i 段假名後，合成一拍：「${convert('きゃ', script)}」一拍，「${convert('きや', script)}」兩拍。「${convert('びょういん', script)}」與「${convert('びよういん', script)}」意思不同。${rewrite}`, items: contracted, words: [contracted[0], contracted[1]]}
  ];
};

export const kanaUnits = ['hira', 'kata'].flatMap(script => {
  const rows = kanaRows.map(([glyphs, roman], index) => {
    const readings = roman.split(' ');
    const items = [...glyphs].flatMap((glyph, i) => glyph === '　' ? [] : [item(convert(glyph, script), readings[i])]);
    const word = item(convert(rowWords[index][0], script), ...rowWords[index].slice(1));
    const baseIndex = voicedBases[index];
    const contrast = baseIndex === undefined ? [] : [...kanaRows[baseIndex][0]].map((glyph, i) => item(convert(glyph, script), kanaRows[baseIndex][1].split(' ')[i]));
    if (index === 15) contrast.push(...[...kanaRows[14][0]].map((glyph, i) => item(convert(glyph, script), kanaRows[14][1].split(' ')[i])));
    let note = index < 11 ? '先看字形與讀音，再用辨讀、拼排和撤提示回想慢慢練習。' : index === 15 ? '右上角小圓圈是半濁音記號。比較 は／ば／ぱ 的 h、b、p，字形與聲音都要留意。' : '右上角兩點是濁音記號。比較有、沒有兩點時，讀音怎麼改變。';
    if (index === 9) note += '「を」在現代日語主要作助詞，讀 o；拼音 wo 常用於鍵盤輸入。';
    if (index === 10) note += '「ん」單獨占一拍；聲音會隨後面的音改變，不能當作前一個假名的一部分。';
    if (index === 5) note += '「は」作助詞時讀 wa，「へ」作助詞時讀 e；這裡先練假名原本的讀音。';
    if (index === 13) note += '「ぢ／づ」一般分別與「じ／ず」同音；不能只靠聽音判斷用字。本單元限定從だ行選字。';
    if (script === 'kata') note = katakana(note);
    return {id: `${script}-row-${index}`, script, title: convert(rowNames[index], script), category: index < 11 ? '基本假名' : index === 15 ? '半濁音' : '濁音', note, items, words: [word], contrast, rewrite: script === 'kata'};
  });
  return [...rows, ...specialUnits(script).map(unit => ({...unit, id: `${script}-${unit.key}`, script, contrast: [], rewrite: false}))];
});
const unitById = new Map(kanaUnits.map(unit => [unit.id, unit]));
const rotate = (values, count) => values.slice(count % values.length).concat(values.slice(0, count % values.length));

export function kanaTasks(unitId) {
  const unit = unitById.get(unitId);
  if (!unit) return [];
  const pool = [...unit.items, ...unit.contrast];
  // One-character rows (ん) still need a real discrimination task.
  if (pool.length < 3) pool.push(item(convert('り', unit.script), 'ri'), item(convert('そ', unit.script), 'so'));
  const recognition = unit.items.map((target, index) => {
    const local = pool.filter(candidate => candidate.kana !== target.kana);
    const preferred = unit.contrast.length ? [unit.contrast[index % 5], ...(unit.category === '半濁音' ? [unit.contrast[index % 5 + 5]] : [])] : [];
    const options = [...new Set([target.kana, ...preferred.filter(Boolean).map(value => value.kana), ...local.map(value => value.kana)])].slice(0, 4);
    return {id: `recognize-${index}`, stage: 'recognize', target, answer: target.kana, options: rotate(options, index + 1)};
  });
  const assembly = unit.words.map((target, index) => ({id: `assemble-${index}`, stage: 'assemble', target, answer: target.kana, tiles: rotate([...target.kana].reverse(), index + 1)}));
  const recall = unit.items.map((target, index) => ({id: `recall-${index}`, stage: 'recall', target, answer: target.kana}));
  return [...recognition, ...assembly, ...recall];
}

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER) : 0;
const timestamp = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 8640000000000000 ? Math.floor(value) : null;
const emptyUnit = () => ({demoSeen: false, completedAt: null, practiceCount: 0, items: {}});
const emptyRecord = () => ({firstAnswer: null, firstUsedHint: false, attempts: 0, correct: 0, errors: 0, hints: 0, lastCorrect: null, lastAt: null});

export function normalizeKanaProgress(value) {
  const source = plain(value) ? value : {};
  const script = source.script === 'kata' ? 'kata' : 'hira';
  const next = {version: 1, script, selectedUnit: unitById.get(source.selectedUnit)?.script === script ? source.selectedUnit : `${script}-row-0`, skippedAt: timestamp(source.skippedAt), units: {}};
  if (!plain(source.units)) return next;
  for (const unit of kanaUnits) {
    if (!Object.hasOwn(source.units, unit.id) || !plain(source.units[unit.id])) continue;
    const input = source.units[unit.id];
    const saved = emptyUnit();
    saved.demoSeen = input.demoSeen === true;
    const records = plain(input.items) ? input.items : {};
    for (const task of kanaTasks(unit.id)) {
      if (!Object.hasOwn(records, task.id) || !plain(records[task.id])) continue;
      const raw = records[task.id];
      const record = emptyRecord();
      record.correct = integer(raw.correct);
      record.errors = integer(raw.errors);
      record.attempts = Math.min(record.correct + record.errors, Number.MAX_SAFE_INTEGER);
      record.hints = integer(raw.hints);
      record.firstAnswer = record.attempts && ['correct', 'wrong'].includes(raw.firstAnswer) ? raw.firstAnswer : null;
      record.firstUsedHint = raw.firstUsedHint === true;
      record.lastCorrect = record.attempts && typeof raw.lastCorrect === 'boolean' ? raw.lastCorrect : null;
      record.lastAt = timestamp(raw.lastAt);
      saved.items[task.id] = record;
    }
    const allAttempted = kanaTasks(unit.id).every(task => saved.items[task.id]?.correct > 0);
    saved.completedAt = allAttempted ? timestamp(input.completedAt) : null;
    saved.practiceCount = saved.completedAt ? integer(input.practiceCount) : 0;
    next.units[unit.id] = saved;
  }
  return next;
}

export function kanaWeaknesses(value, unitId) {
  const progress = normalizeKanaProgress(value);
  return kanaUnits.filter(unit => !unitId || unit.id === unitId).flatMap(unit => kanaTasks(unit.id).flatMap(task => {
    const record = progress.units[unit.id]?.items[task.id];
    return record && (record.errors > 0 || record.hints > 0) ? [{unitId: unit.id, taskId: task.id, stage: task.stage, kana: task.target.kana, errors: record.errors, hints: record.hints}] : [];
  }));
}

export const kanaMode = available => available
  ? {mode: 'listening', label: '聽音選字', message: '使用裝置日語聲線；可切換成文字辨讀。'}
  : {mode: 'text', label: '文字辨讀', message: '尚無可用的日語聲線，目前使用文字替代模式；這次不算聽力練習。'};

export function startKanaSession(unitId) {
  if (!unitById.has(unitId)) throw new Error('找不到這個假名單元。');
  return {unitId, index: 0, solved: false, usedHint: false, finished: false};
}

export function applyKanaEvent(value, current, event, at = Date.now()) {
  const progress = normalizeKanaProgress(value);
  const session = {...current};
  const unit = unitById.get(session.unitId);
  const task = kanaTasks(session.unitId)[session.index];
  if (!unit || !task || session.finished) return {progress, session, accepted: false};
  const saved = progress.units[unit.id] ??= emptyUnit();
  const record = saved.items[task.id] ??= emptyRecord();
  if (event.type === 'hint' && !session.solved && !session.usedHint) {
    record.hints++;
    session.usedHint = true;
    if (!record.attempts) record.firstUsedHint = true;
    return {progress, session, accepted: true};
  }
  if (event.type === 'answer' && !session.solved) {
    const ok = typeof event.value === 'string' && event.value.normalize('NFKC').trim() === task.answer;
    record.attempts++;
    record[ok ? 'correct' : 'errors']++;
    if (record.firstAnswer === null) {
      record.firstAnswer = ok ? 'correct' : 'wrong';
      record.firstUsedHint ||= session.usedHint;
    }
    record.lastCorrect = ok;
    record.lastAt = timestamp(at);
    session.solved = ok;
    return {progress, session, accepted: true, ok};
  }
  if (event.type === 'next' && session.solved) {
    session.index++;
    session.solved = false;
    session.usedHint = false;
    session.finished = session.index >= kanaTasks(unit.id).length;
    if (session.finished) {
      saved.completedAt ??= timestamp(at);
      saved.practiceCount++;
    }
    return {progress, session, accepted: true};
  }
  return {progress, session, accepted: false};
}

/** A self-contained view: all listeners belong to the current DOM nodes. */
export function mountKana({root, shell, esc, speak, stopVoice, notify, getProgress, saveProgress, onContinue, hasVoice}) {
  let progress = normalizeKanaProgress(getProgress());
  let selected = unitById.get(progress.selectedUnit);
  let session = null;
  let chosen = [];
  let feedback = '';
  let pending = false;
  let listening = false;
  let screen = null;
  const available = () => Boolean(typeof hasVoice === 'function' ? hasVoice() : hasVoice);
  const snapshot = () => normalizeKanaProgress(getProgress());
  const bind = (selector, action) => root.querySelectorAll(selector).forEach(element => {element.onclick = event => {event.preventDefault(); if (!pending) return action(element);};});
  const playButton = (text, label = '聽示範') => available() ? `<button data-kana-play="${esc(text)}">${esc(label)}</button>` : '';
  const summary = unit => {
    const data = progress.units[unit.id];
    const records = Object.values(data?.items ?? {});
    const answered = records.filter(record => record.firstAnswer !== null).length;
    const first = records.filter(record => record.firstAnswer === 'correct' && !record.firstUsedHint).length;
    return {data, first, answered, weak: kanaWeaknesses(progress, unit.id)};
  };
  async function persist(next, after) {
    if (pending) return;
    pending = true;
    const owner = screen;
    try {
      const result = await saveProgress(normalizeKanaProgress(next));
      if (root.querySelector('[data-kana-screen]') !== owner) return;
      if (result === false) {notify('假名進度尚未儲存，請再試一次。'); return;}
      progress = normalizeKanaProgress(next);
      after();
    } catch {notify('假名進度尚未儲存，請再試一次。');}
    finally {pending = false;}
  }
  function show(html) {
    stopVoice();
    shell(`<section class="panel" data-kana-screen>${html}</section>`);
    screen = root.querySelector('[data-kana-screen]');
    bind('[data-kana-play]', button => {
      if (!available() || speak(button.dataset.kanaPlay, {notify}) === false) {
        listening = false;
        notify(kanaMode(false).message);
        session && !session.finished ? practice() : directory();
      }
    });
    bind('[data-kana-directory]', () => {session = null; directory();});
    bind('[data-kana-continue]', () => {
      const next = snapshot();
      next.skippedAt = Date.now();
      persist(next, () => {stopVoice(); onContinue();});
    });
  }
  const exits = () => '<div class="actions"><button data-kana-directory>回單元列表</button><button data-kana-continue>先跳過，前往故事主線</button></div>';
  function directory() {
    progress = snapshot();
    const units = kanaUnits.filter(unit => unit.script === progress.script);
    const info = summary(selected);
    const completed = Object.values(progress.units).filter(unit => unit.completedAt).length;
    show(`<p class="eyebrow">一行一行，為旅程暖身</p><h1>假名練習室</h1><p>選一行開始：看示範 → 辨讀 → 拼排詞語 → 撤提示回想。每個單元可以重練，也可以隨時先走進故事。</p><p>已完整練過 ${completed} / ${kanaUnits.length} 個單元。這是練習紀錄，不代表已精熟五十音；隔天再回想，才能多了解記住了多少。</p><p class="tip">${esc(kanaMode(available()).message)}</p><div class="tabs" role="group" aria-label="選擇假名字體">${['hira', 'kata'].map(script => `<button data-kana-script="${script}" class="${progress.script === script ? 'selected' : ''}" aria-pressed="${progress.script === script}">${scriptName(script)}</button>`).join('')}</div><div class="actions" role="group" aria-label="選擇假名單元">${units.map(unit => `<button data-kana-unit="${unit.id}" aria-pressed="${selected.id === unit.id}">${esc(unit.title)}${progress.units[unit.id]?.completedAt ? '・已練過' : ''}</button>`).join('')}</div><h2>${scriptName(selected.script)}・${esc(selected.title)}</h2><p>${esc(selected.note)}</p><div class="${selected.items.some(target => [...target.kana].length > 1) ? 'choices' : 'kana-grid'}">${[...selected.items, ...selected.contrast].map(target => `<button data-kana-demo="${esc(target.kana)}" aria-label="${esc(target.kana)}，${esc(target.rom)}"><span lang="ja">${esc(target.kana)}</span><small>${esc(target.rom)}</small></button>`).join('')}</div><p data-kana-demo-status role="status">點字卡可再看讀音${available() ? '，並聽示範' : '；目前提供文字示範'}。</p>${selected.items.some(target => target.meaning) ? `<p>${selected.items.filter(target => target.meaning).map(target => `${esc(target.kana)}：${esc(target.meaning)}`).join('；')}</p>` : ''}<h3>這次會拼排的詞</h3>${selected.words.map(target => `<p><span lang="ja">${esc(target.kana)}</span> · ${esc(target.rom)} · ${esc(target.meaning)} ${playButton(target.kana)}</p>`).join('')}${selected.rewrite ? '<p class="muted">片假名拼排採用上方詞語的改寫字形，平常不一定這樣書寫。尚未練到的字，也先在這裡看一次。</p>' : '<p class="muted">詞語可能含其他行的字；先看完整示範，再慢慢拼排。</p>'}<p>首次遇到且無提示答對：${info.first} / ${info.answered} 題；完整練過 ${info.data?.practiceCount ?? 0} 次。</p>${info.weak.length ? `<p>曾錯或用提示、值得再練：${[...new Set(info.weak.map(task => task.kana))].map(esc).join('、')}。這些紀錄會保留，方便找回曾卡住的地方。</p>` : '<p>這一單元尚無錯答或提示紀錄。</p>'}<div class="actions"><button class="primary" data-kana-start>看完示範，開始辨讀</button><button data-kana-continue>先跳過，前往故事主線</button></div>`);
    bind('[data-kana-script]', button => {
      const next = snapshot();
      next.script = button.dataset.kanaScript;
      next.selectedUnit = `${next.script}-row-0`;
      persist(next, () => {selected = unitById.get(next.selectedUnit); directory();});
    });
    bind('[data-kana-unit]', button => {
      const next = snapshot();
      next.selectedUnit = button.dataset.kanaUnit;
      persist(next, () => {selected = unitById.get(next.selectedUnit); directory();});
    });
    bind('[data-kana-demo]', button => {
      const target = [...selected.items, ...selected.contrast].find(value => value.kana === button.dataset.kanaDemo);
      root.querySelector('[data-kana-demo-status]').textContent = `${target.kana}：${target.rom}${target.meaning ? `，${target.meaning}` : ''}`;
      if (available()) speak(target.kana, {notify});
    });
    bind('[data-kana-start]', () => {
      const next = snapshot();
      (next.units[selected.id] ??= emptyUnit()).demoSeen = true;
      persist(next, () => {session = startKanaSession(selected.id); chosen = []; feedback = ''; listening = available(); practice();});
    });
  }
  async function event(type, value) {
    const result = applyKanaEvent(snapshot(), session, {type, value});
    if (!result.accepted) return;
    await persist(result.progress, () => {
      session = result.session;
      if (type === 'next') {feedback = ''; chosen = [];}
      if (type === 'answer') feedback = result.ok ? '答對了。準備好再往下一步。' : '還沒對上，再試一次。需要時可以看提示。';
      session.finished ? finish() : practice();
    });
  }
  function practice() {
    const tasks = kanaTasks(session.unitId);
    const task = tasks[session.index];
    if (!available()) listening = false;
    const stage = {recognize: '第二步・辨讀', assemble: '第三步・拼排詞語', recall: '第四步・撤提示回想'}[task.stage];
    const heard = task.stage === 'recognize' && listening;
    let body = '';
    if (task.stage === 'recognize') body = `<h2>${heard ? '聽讀音，選出對應的假名' : '看拼音，選出對應的假名'}</h2><p>${heard ? '先按「播放題目」再作答。' : `讀音：${esc(task.target.rom)}`}${selected.id.endsWith('row-13') ? `（限${convert('だ', selected.script)}行）` : ''}</p>${heard ? playButton(task.target.kana, '播放題目') : ''}${available() ? `<button data-kana-mode>${listening ? '切換文字辨讀' : '切換聽音選字'}</button>` : `<p class="tip">${esc(kanaMode(false).message)}</p>`}<div class="choices">${task.options.map(option => `<button data-kana-answer="${esc(option)}" lang="ja" ${session.solved ? 'disabled' : ''}>${esc(option)}</button>`).join('')}</div>`;
    if (task.stage === 'assemble') body = `<h2>把假名排成剛才見過的詞</h2><p>${esc(task.target.meaning)} · 讀音 ${esc(task.target.rom)}</p><p>點字卡依序放入；小假名、促音與長音符號都要放對位置。</p><p class="word" lang="ja" aria-live="polite">${esc(chosen.map(index => task.tiles[index]).join('')) || '＿＿'}</p><div class="actions">${task.tiles.map((tile, index) => `<button data-kana-tile="${index}" lang="ja" ${chosen.includes(index) || session.solved ? 'disabled' : ''}>${esc(tile)}</button>`).join('')}</div><div class="actions"><button data-kana-undo ${!chosen.length || session.solved ? 'disabled' : ''}>退回一格</button><button data-kana-clear ${!chosen.length || session.solved ? 'disabled' : ''}>重新排</button><button class="primary" data-kana-check ${chosen.length !== task.tiles.length || session.solved ? 'disabled' : ''}>檢查拼排</button></div>`;
    if (task.stage === 'recall') body = `<h2>收起字卡，回想假名</h2><p>讀音：${esc(task.target.rom)}${task.target.meaning ? ` · ${esc(task.target.meaning)}` : ''}</p><p>輸入${scriptName(selected.script)}，可以使用裝置的日文鍵盤。畫面先不給字形與選項；看提示會如實留下紀錄。</p><label for="kana-recall-input">你的假名</label><input id="kana-recall-input" data-kana-input lang="ja" autocomplete="off" autocapitalize="off" spellcheck="false" ${session.solved ? 'disabled' : ''}><button class="primary" data-kana-check ${session.solved ? 'disabled' : ''}>檢查回想</button>`;
    show(`<p class="eyebrow">${scriptName(selected.script)}・${esc(selected.title)} · ${stage}</p><p>本單元第 ${session.index + 1} / ${tasks.length} 題</p><div class="progress" role="progressbar" aria-label="本次單元練習" aria-valuemin="0" aria-valuemax="${tasks.length}" aria-valuenow="${session.index}"><span style="width:${session.index / tasks.length * 100}%"></span></div>${body}<p class="feedback" role="status">${esc(feedback)}</p>${session.usedHint ? `<p class="tip">提示：<span lang="ja">${esc(task.answer)}</span> · ${esc(task.target.rom)}</p>` : `<button data-kana-hint ${session.solved ? 'disabled' : ''}>看字形提示（會留下紀錄）</button>`}<div class="actions">${session.solved ? '<button class="primary" data-kana-next>下一步</button>' : ''}</div>${exits()}`);
    bind('[data-kana-answer]', button => event('answer', button.dataset.kanaAnswer));
    bind('[data-kana-mode]', () => {listening = !listening; practice();});
    bind('[data-kana-hint]', () => event('hint'));
    bind('[data-kana-next]', () => event('next'));
    bind('[data-kana-tile]', button => {chosen.push(Number(button.dataset.kanaTile)); feedback = ''; practice();});
    bind('[data-kana-undo]', () => {chosen.pop(); feedback = ''; practice();});
    bind('[data-kana-clear]', () => {chosen = []; feedback = ''; practice();});
    bind('[data-kana-check]', () => event('answer', task.stage === 'assemble' ? chosen.map(index => task.tiles[index]).join('') : root.querySelector('[data-kana-input]').value));
  }
  function finish() {
    const info = summary(selected);
    show(`<p class="eyebrow">今天，多認識了一行聲音</p><h1>「${esc(selected.title)}」完整練過一次</h1><p>你走完了示範、辨讀、拼排與回想。這表示完成一輪練習；熟不熟，還要隔天撤掉提示再試試。</p><p>本單元首次遇到且無提示答對：${info.first} / ${info.answered} 題。</p>${info.weak.length ? `<p>值得再練：${[...new Set(info.weak.map(task => task.kana))].map(esc).join('、')}。錯答和提示都會留在單元紀錄裡。</p>` : '<p>這輪沒有留下錯答或提示紀錄。明天再回來看看記住了多少。</p>'}${exits()}`);
  }
  directory();
}
