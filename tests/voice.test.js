import test from 'node:test';import assert from 'node:assert/strict';
import {speak,stopVoice} from '../voice.js';
test('長篇分句順序朗讀，停止後不續播，缺日語聲線明確回報',()=>{const spoken=[];let available=true;globalThis.speechSynthesis={getVoices:()=>available?[{lang:'ja-JP',name:'test'}]:[],cancel:()=>{},speak:u=>spoken.push(u)};globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 assert.equal(speak('朝です。村に行きます。夜です。'),true);assert.equal(spoken[0].text,'朝です。');spoken[0].onend();assert.equal(spoken[1].text,'村に行きます。');stopVoice();spoken[1].onend();assert.equal(spoken.length,2);
 speak('〜かげつ',{slow:true});assert.equal(spoken.at(-1).text,'かげつ');assert.equal(spoken.at(-1).rate,.65);available=false;let message='';assert.equal(speak('朝',{notify:x=>message=x}),false);assert.ok(message.includes('日語声線')||message.includes('日語聲線'));delete globalThis.speechSynthesis;delete globalThis.SpeechSynthesisUtterance;
});
