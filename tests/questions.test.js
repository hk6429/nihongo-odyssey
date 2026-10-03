import test from 'node:test';import assert from 'node:assert/strict';
import {words} from '../curriculum.js';import {readingCue,distractorPool} from '../question-helpers.js';import {normalize} from '../engine.js';
test('同中文意義的讀音題必須提供指定日文詞形',()=>{for(const key of ['これ','この','どれ','どの','なぜ','なんで']){const w=words.find(w=>w.word===key||w.kana===key);assert.ok(w, key);if(words.some(x=>x.id!==w.id&&x.meaning===w.meaning))assert.equal(readingCue(w,words),w.word);}});
test('同音詞不得成為聽辨干擾答案',()=>{for(const key of ['五','五日']){const w=words.find(w=>w.word===key);assert.ok(distractorPool(w,words).length>3);assert.ok(distractorPool(w,words).every(x=>normalize(x.kana)!==normalize(w.kana)));}});
test('常見數字的合法其他讀法也接受',async()=>{const {acceptedReadings}=await import('../engine.js');for(const [word,kana] of [['四','し'],['七','しち'],['九','く']])assert.ok(acceptedReadings(words.find(w=>w.word===word)).includes(kana));});
