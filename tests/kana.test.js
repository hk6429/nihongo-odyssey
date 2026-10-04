import test from 'node:test';
import assert from 'node:assert/strict';
import {kanaRows, katakana} from '../legacy-data.js';
import {kanaUnits, kanaTasks, normalizeKanaProgress, kanaWeaknesses, kanaMode, startKanaSession, applyKanaEvent, mountKana} from '../kana.js';

test('平片假名各19單元，逐行覆蓋基本字、濁音、半濁音與三種特殊音', () => {
  assert.equal(kanaUnits.length, 38);
  assert.equal(new Set(kanaUnits.map(unit => unit.id)).size, 38);
  for (const script of ['hira', 'kata']) {
    const units = kanaUnits.filter(unit => unit.script === script);
    const glyphs = units.filter(unit => unit.id.includes('-row-')).flatMap(unit => unit.items.map(item => item.kana));
    const expected = kanaRows.flatMap(([row]) => [...row].filter(glyph => glyph !== '　')).map(glyph => script === 'kata' ? katakana(glyph) : glyph);
    assert.deepEqual(glyphs, expected);
    assert.equal(glyphs.length, 71);
    for (const category of ['基本假名', '濁音', '半濁音', '長音', '促音', '拗音']) assert.ok(units.some(unit => unit.category === category));
  }
});

test('每單元的每個示範項目都進入辨讀與撤提示回想，並含可拼排的詞', () => {
  for (const unit of kanaUnits) {
    const tasks = kanaTasks(unit.id);
    assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length);
    assert.deepEqual(tasks.filter(task => task.stage === 'recognize').map(task => task.answer), unit.items.map(item => item.kana));
    assert.deepEqual(tasks.filter(task => task.stage === 'recall').map(task => task.answer), unit.items.map(item => item.kana));
    assert.ok(tasks.some(task => task.stage === 'assemble'));
    for (const task of tasks) {
      if (task.stage === 'recognize') {
        assert.ok(task.options.includes(task.answer), `${unit.id} ${task.id}`);
        assert.equal(task.options.length, new Set(task.options).size);
        assert.ok(task.options.length >= 2);
      }
      if (task.stage === 'assemble') assert.deepEqual([...task.tiles].sort(), [...task.answer].sort());
      if (task.stage === 'recall') assert.equal(task.options, undefined);
    }
  }
  assert.deepEqual(kanaTasks('unknown'), []);
});

test('長音、促音、拗音及清濁半濁有最小對比，半濁音包含清濁兩種干擾', () => {
  const pairs = {
    'hira-long': ['おばさん', 'おばあさん'], 'kata-long': ['ビル', 'ビール'],
    'hira-sokuon': ['きて', 'きって'], 'kata-sokuon': ['キテ', 'キッテ'],
    'hira-yoon': ['びょういん', 'びよういん'], 'kata-yoon': ['ビョウイン', 'ビヨウイン'],
    'hira-row-11': ['か', 'が'], 'kata-row-11': ['カ', 'ガ']
  };
  for (const [unitId, pair] of Object.entries(pairs)) assert.ok(kanaTasks(unitId).some(task => pair.every(glyph => task.options?.includes(glyph))), unitId);
  assert.ok(kanaTasks('hira-row-15')[0].options.includes('は'));
  assert.ok(kanaTasks('hira-row-15')[0].options.includes('ば'));
  assert.ok(kanaTasks('hira-row-15')[0].options.includes('ぱ'));
});

test('錯答停留同題、可重試；首答與提示紀錄不可被重試或重練洗掉', () => {
  const original = normalizeKanaProgress({});
  let state = applyKanaEvent(original, startKanaSession('hira-row-0'), {type: 'answer', value: 'お'}, 100);
  assert.equal(state.ok, false);
  assert.equal(state.session.index, 0);
  assert.equal(state.progress.units['hira-row-0'].items['recognize-0'].firstAnswer, 'wrong');
  assert.deepEqual(original.units, {});
  assert.equal(applyKanaEvent(state.progress, state.session, {type: 'next'}, 110).accepted, false);
  state = applyKanaEvent(state.progress, state.session, {type: 'hint'}, 120);
  state = applyKanaEvent(state.progress, state.session, {type: 'answer', value: 'あ'}, 130);
  const record = state.progress.units['hira-row-0'].items['recognize-0'];
  assert.equal(state.ok, true);
  assert.equal(record.firstAnswer, 'wrong');
  assert.equal(record.firstUsedHint, false);
  assert.deepEqual([record.attempts, record.errors, record.correct, record.hints], [2, 1, 1, 1]);
  assert.equal(applyKanaEvent(state.progress, state.session, {type: 'answer', value: 'あ'}).accepted, false);
  state = applyKanaEvent(state.progress, startKanaSession('hira-row-0'), {type: 'answer', value: 'あ'}, 200);
  assert.equal(state.progress.units['hira-row-0'].items['recognize-0'].firstAnswer, 'wrong');
  assert.equal(kanaWeaknesses(state.progress, 'hira-row-0').length, 1);
});

test('先看提示再答對，不列為首次無提示答對；重複提示只計一次', () => {
  let state = applyKanaEvent({}, startKanaSession('kata-row-0'), {type: 'hint'}, 100);
  assert.equal(applyKanaEvent(state.progress, state.session, {type: 'hint'}).accepted, false);
  state = applyKanaEvent(state.progress, state.session, {type: 'answer', value: 'ア'}, 200);
  assert.equal(state.progress.units['kata-row-0'].items['recognize-0'].firstAnswer, 'correct');
  assert.equal(state.progress.units['kata-row-0'].items['recognize-0'].firstUsedHint, true);
  assert.equal(kanaWeaknesses(state.progress)[0].hints, 1);
});

test('看提示後離開再回來，不會洗掉首答前曾用提示的紀錄', () => {
  let state = applyKanaEvent({}, startKanaSession('hira-row-0'), {type: 'hint'}, 100);
  state = applyKanaEvent(state.progress, startKanaSession('hira-row-0'), {type: 'answer', value: 'あ'}, 200);
  assert.equal(state.progress.units['hira-row-0'].items['recognize-0'].firstUsedHint, true);
});

test('逐一完成38單元全階段才留下完整練習紀錄，正規化不改有效進度', () => {
  let progress = normalizeKanaProgress({});
  for (const unit of kanaUnits) {
    let session = startKanaSession(unit.id);
    for (const task of kanaTasks(unit.id)) {
      let result = applyKanaEvent(progress, session, {type: 'answer', value: task.answer}, 300);
      assert.equal(result.ok, true);
      assert.equal(result.progress.units[unit.id].completedAt, null);
      result = applyKanaEvent(result.progress, result.session, {type: 'next'}, 400);
      progress = result.progress;
      session = result.session;
    }
    assert.equal(session.finished, true);
    assert.equal(progress.units[unit.id].completedAt, 400);
    assert.equal(progress.units[unit.id].practiceCount, 1);
    assert.equal(applyKanaEvent(progress, session, {type: 'next'}).accepted, false);
  }
  assert.deepEqual(normalizeKanaProgress(progress), progress);
  assert.equal(kanaWeaknesses(progress).length, 0);
});

test('畸形備份與未知欄位不污染假名進度，不能偽造只完成五題就完成單元', () => {
  for (const value of [undefined, null, [], true, 2, 'bad']) assert.deepEqual(normalizeKanaProgress(value), normalizeKanaProgress({}));
  const raw = JSON.parse('{"script":"invalid","selectedUnit":"unknown","skippedAt":-1,"units":{"__proto__":{"polluted":true},"unknown":{"completedAt":123},"hira-row-0":{"demoSeen":"yes","completedAt":123,"practiceCount":999,"items":{"recognize-0":{"attempts":9000,"correct":1,"errors":-1,"hints":-1,"firstAnswer":"right","lastAt":-1,"lastCorrect":"yes"},"unknown":{"correct":1}}}}}');
  const result = normalizeKanaProgress(raw);
  assert.equal(result.script, 'hira');
  assert.equal(result.selectedUnit, 'hira-row-0');
  assert.equal(result.skippedAt, null);
  assert.deepEqual(Object.keys(result.units), ['hira-row-0']);
  assert.equal(result.units['hira-row-0'].completedAt, null);
  assert.equal(result.units['hira-row-0'].practiceCount, 0);
  assert.equal(result.units['hira-row-0'].items['recognize-0'].attempts, 1);
  assert.equal(result.units['hira-row-0'].items['recognize-0'].lastAt, null);
  assert.equal({}.polluted, undefined);
  assert.equal(normalizeKanaProgress({script: 'kata', selectedUnit: 'hira-row-0'}).selectedUnit, 'kata-row-0');
});

// Minimal DOM boundary double; exercises the view's actual local click handlers.
class View {
  set innerHTML(value) {
    this.html = value;
    this.nodes = [...value.matchAll(/<(button|input|p|section)\b([^>]*)>/g)].map(match => {
      const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(attr => [attr[1], attr[2] ?? '']));
      return {attributes, dataset: Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()), value])), disabled: Object.hasOwn(attributes, 'disabled'), value: '', textContent: '', focus() {}};
    });
  }
  querySelectorAll(selector) {
    const [, name, value] = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    return this.nodes.filter(node => Object.hasOwn(node.attributes, name) && (value === undefined || node.attributes[name] === value));
  }
  querySelector(selector) {return this.querySelectorAll(selector)[0] ?? null;}
  async click(selector) {const node = this.querySelector(selector); assert.ok(node, selector); assert.equal(node.disabled, false); await node.onclick({preventDefault() {}});}
}
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
function viewHarness({hasVoice = false, save = true, initial} = {}) {
  const root = new View();
  let progress = normalizeKanaProgress(initial);
  let continued = 0;
  const messages = [];
  mountKana({root, shell: html => {root.innerHTML = html;}, esc: escapeHtml, speak: () => {throw new Error('文字模式不應要求朗讀');}, stopVoice() {}, notify: message => messages.push(message), getProgress: () => progress, saveProgress: async next => {if (save) progress = next; return save;}, onContinue: () => {continued++;}, hasVoice});
  return {root, messages, progress: () => progress, continued: () => continued};
}

test('無日語聲線的實際畫面標示文字模式，可選單元、錯答重試、看提示並跳過', async () => {
  const view = viewHarness();
  assert.equal(kanaMode(false).mode, 'text');
  assert.equal(kanaMode(true).mode, 'listening');
  assert.match(view.root.html, /文字替代模式/);
  assert.match(view.root.html, /這次不算聽力練習/);
  await view.root.click('[data-kana-script="kata"]');
  await view.root.click('[data-kana-unit="kata-sokuon"]');
  assert.match(view.root.html, /class="choices"/);
  assert.doesNotMatch(view.root.html, /class="kana-grid"/);
  await view.root.click('[data-kana-start]');
  assert.match(view.root.html, /看拼音，選出對應的假名/);
  assert.doesNotMatch(view.root.html, /data-kana-play=/);
  await view.root.click('[data-kana-answer="キッテ"]');
  assert.match(view.root.html, /正確答案是「キテ」/);
  assert.equal(view.root.querySelector('[data-kana-answer="キテ"]').disabled,true);
  await view.root.click('[data-kana-retry]');
  assert.equal(view.root.querySelector('[data-kana-next]'), null);
  await view.root.click('[data-kana-hint]');
  assert.match(view.root.html, /提示：<span lang="ja">キテ/);
  await view.root.click('[data-kana-answer="キテ"]');
  assert.equal(view.progress().units['kata-sokuon'].items['recognize-0'].firstAnswer, 'wrong');
  await view.root.click('[data-kana-continue]');
  assert.equal(view.continued(), 1);
  assert.ok(view.progress().skippedAt);
  assert.equal(view.progress().units['kata-sokuon'].completedAt, null);
});

test('拼排含重複字卡可個別選取，撤提示回想不提供選項', async () => {
  const view = viewHarness({initial: {selectedUnit: 'hira-row-5'}});
  await view.root.click('[data-kana-start]');
  for (const task of kanaTasks('hira-row-5').filter(task => task.stage === 'recognize')) {
    await view.root.click(`[data-kana-answer="${task.answer}"]`);
  }
  assert.match(view.root.html, /第三步・拼排詞語/);
  await view.root.click('[data-kana-tile="0"]');
  await view.root.click('[data-kana-tile="1"]');
  await view.root.click('[data-kana-check]');
  assert.match(view.root.html, /第四步・撤提示回想/);
  assert.equal(view.root.querySelectorAll('[data-kana-answer]').length, 0);
  assert.equal(view.root.querySelectorAll('[data-kana-tile]').length, 0);
  view.root.querySelector('[data-kana-input]').value = 'は';
  await view.root.click('[data-kana-check]');
  assert.match(view.root.html, /讀音：hi/);
  assert.equal(view.root.querySelector('[data-kana-next]'),null);
});

test('保存失敗時不假裝前進，使用者仍可重試', async () => {
  const view = viewHarness({save: false});
  await view.root.click('[data-kana-start]');
  assert.match(view.root.html, /假名練習室/);
  assert.equal(view.progress().units['hira-row-0'], undefined);
  assert.match(view.messages[0], /尚未儲存/);
  await view.root.click('[data-kana-continue]');
  assert.equal(view.continued(), 0);
});
