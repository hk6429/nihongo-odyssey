import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vocabulary from '../data/vocabulary.json' with {type:'json'};
import layer from '../data/vocabulary-overrides.json' with {type:'json'};
import {lessons, commonGlossary} from '../lessons.js';
import {episodes} from '../story.js';
import {applyVocabularyOverrides} from '../scripts/apply-vocabulary-overrides.mjs';
const byId = new Map(vocabulary.map(word => [word.id, word]));
const lessonTexts = lesson => [lesson.grammar.example, ...Object.values(lesson.beats).flat().map(x => x.ja), ...Object.values(lesson.checks).flat().flatMap(x => [x.ja, ...x.options])];

test('詢問名稱的何ですか不得誤切成為什麼的何で', () => {
  const glossary = [...commonGlossary, ...lessons['N5-1'].glossary].sort((a,b) => b.surface.length-a.surface.length);
  const term = glossary.find(x => '何ですか'.startsWith(x.surface));
  assert.deepEqual(term, {surface:'何ですか',reading:'なんですか',meaning:'是什麼呢'});
});

test('原詞庫10629唯一詞不變；125筆補充層涵蓋全部122筆缺例句', async () => {
  const originalMissing = vocabulary.filter(word => !word.example);
  assert.equal(vocabulary.length, 10629);
  assert.equal(byId.size, 10629);
  assert.equal(originalMissing.length, 122);
  assert.equal(Object.keys(layer.entries).length, 125);
  const merged = applyVocabularyOverrides(vocabulary, layer);
  assert.equal(merged.filter(word => !word.example || !word.translation).length, 0);
  for (const word of originalMissing) {
    const addition = layer.entries[word.id];
    assert.ok(addition.example.includes(word.word), word.word);
    assert.match(addition.example, /。$/);
    assert.equal(addition.exampleSource, 'original');
    assert.ok(addition.translation.length >= 5);
  }
  assert.deepEqual(merged.map(word => word.id), vocabulary.map(word => word.id));
  const audit = JSON.parse(await readFile(new URL('../docs/vocabulary-audit.json', import.meta.url), 'utf8'));
  const bytes = await readFile(new URL('../data/vocabulary.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), audit.vocabularySha256);
  assert.match(layer.metadata.authorship, /未經真人日語教師審定/);
});

test('補充層不能改動來源、讀音與識別碼，也不接受幽靈詞', () => {
  const id = vocabulary[0].id;
  assert.throws(() => applyVocabularyOverrides(vocabulary, {schemaVersion:1, entries:{ghost:{example:'例です。',translation:'這是例子。'}}}));
  assert.throws(() => applyVocabularyOverrides(vocabulary, {schemaVersion:1, entries:{[id]:{id:'other',example:'例です。',translation:'這是例子。'}}}));
});

test('25課皆有Can-do、教學句型、250個唯一且存在的情境核心詞', () => {
  assert.deepEqual(Object.keys(lessons), episodes.map(e => e.id));
  const ids = [];
  const inflections = {'聞く':'聞き', '行く':'行き', '置く':'置き', '会う':'会い', '手伝う':'手伝', '調べる':'調べ'};
  for (const e of episodes) {
    const lesson = lessons[e.id];
    assert.match(lesson.goal, /^能/);
    for (const field of ['pattern','explanation','example','translation']) assert.ok(lesson.grammar[field]?.length > (field === 'pattern' ? 0 : 3), `${e.id} ${field}`);
    assert.equal(lesson.wordIds.length, 10);
    assert.equal(new Set(lesson.wordIds).size, 10);
    const text = [...lessonTexts(lesson),...e.paragraphs.map(p => p.ja),...e.dialogue.map(p => p.ja)].join('\n');
    for (const id of lesson.wordIds) {
      const word = byId.get(id);
      assert.ok(word, `${e.id} ${id}`);
      assert.ok(text.includes(word.word) || (inflections[word.word] && text.includes(inflections[word.word])), `${e.id} 核心詞未進入教材：${word.word}`);
    }
    ids.push(...lesson.wordIds);
  }
  assert.equal(ids.length, 250);
  assert.equal(new Set(ids).size, 250);
});

test('兩分支各有兩段微情節及讀聽回應各一題；150份新日語材料不重複', () => {
  const ids = new Set(), materials = new Set(), answerCounts = [0,0,0];
  for (const episode of episodes) {
    const lesson = lessons[episode.id];
    const story = episode.paragraphs.map(x => x.ja).join('\n');
    assert.notDeepEqual(lesson.beats.observe, lesson.beats.help);
    for (const branch of ['observe','help']) {
      assert.equal(lesson.beats[branch].length, 2);
      assert.ok(lesson.beats[branch].every(beat => beat.ja && beat.zh));
      const checks = lesson.checks[branch];
      assert.equal(checks.length, 3);
      assert.deepEqual(checks.map(check => check.mode), ['reading','listening','response']);
      for (const check of checks) {
        assert.ok(!ids.has(check.id)); ids.add(check.id);
        assert.ok(!materials.has(check.ja), check.id); materials.add(check.ja);
        assert.ok(!story.includes(check.ja), `${check.id} 重用故事原文`);
        assert.ok(check.ja.length >= 12 && check.prompt && check.translation && check.explanation);
        assert.equal(check.options.length, 3);
        assert.equal(new Set(check.options).size, 3);
        assert.ok(Number.isInteger(check.answer) && check.answer >= 0 && check.answer < check.options.length);
        answerCounts[check.answer]++;
      }
    }
  }
  assert.equal(ids.size, 150);
  assert.deepEqual(answerCounts, [50,50,50]);
});

test('N5原故事、台詞、微情節、句型及檢核日語漢字均有點查讀音', () => {
  assert.ok(commonGlossary.length > 100);
  for (const e of episodes.filter(e => e.level === 'N5')) {
    const lesson = lessons[e.id];
    let text = [...e.paragraphs,...e.dialogue].map(x => x.ja).concat(lessonTexts(lesson)).join('\n');
    const glossary = [...lesson.glossary].sort((a,b) => b.surface.length-a.surface.length);
    for (const item of glossary) {
      assert.ok(item.surface && item.reading && item.meaning);
      text = text.replaceAll(item.surface, ' ');
    }
    assert.equal((text.match(/[一-龯]/g) || []).length, 0, `${e.id} 未有讀音的漢字：${text.match(/[一-龯]+/g)}`);
  }
});

test('彼氏、苦言、マスク語用修正有具體情境與可查辭典', () => {
  const effective = applyVocabularyOverrides(vocabulary, layer);
  const get = surface => effective.find(word => word.word === surface);
  assert.match(get('彼氏').usageNote, /戲謔/);
  assert.match(get('彼氏').usageNote, /不宜/);
  assert.match(get('苦言').meaning, /逆耳/);
  assert.match(get('マスク').translation, /戴.*口罩/);
  assert.match(get('マスク').usageNote, /面具/);
  for (const surface of ['彼氏','苦言','マスク']) assert.match(get(surface).reference, /^https:\/\/(kotobank.jp|www.kanjipedia.jp)\//);
});

test('量詞與回聲時序修正：每個回聲只對應緊接章節或終章後記', () => {
  assert.ok(episodes.find(e => e.id === 'N3-1').paragraphs.some(p => p.ja.includes('二つの道筋')));
  for (const [i,e] of episodes.entries()) for (const choice of e.choices) {
    assert.equal(choice.echoAt, episodes[i+1]?.id ?? 'epilogue');
    assert.ok(choice.echo.length > 20);
  }
  const early = episodes.slice(0,13).flatMap(e => e.choices).map(c => c.echo).join('');
  assert.ok(!early.includes('墨守'), '墨守不得在正式揭露前的回聲提前登場');
});
