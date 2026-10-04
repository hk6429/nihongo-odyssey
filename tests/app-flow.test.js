import {installChoiceKeyboard,choiceHint} from '../choice-keyboard.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as engine from '../engine.js';
import * as curriculum from '../curriculum.js';
import * as story from '../story.js';
import * as lessonData from '../lessons.js';
import * as questionHelpers from '../question-helpers.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const key='nihongo-odyssey-test-v3';
const decode=text=>text.replace(/&(amp|lt|gt|quot|#39);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"})[name]);

// Only the DOM operations used by these app flows are modelled. Replacing HTML
// removes old elements, so a stale continuation really encounters a missing ID.
class Element {
 constructor(tag='div',attributes={},parent=null){
  this.tag=tag;this.attributes=attributes;this.parent=parent;this.children=[];
  this.disabled=Object.hasOwn(attributes,'disabled');this.hidden=Object.hasOwn(attributes,'hidden');
  this.dataset=Object.fromEntries(Object.entries(attributes).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
  this.classList={contains:name=>this.className.split(/\s+/).includes(name),remove:name=>{this.className=this.className.split(/\s+/).filter(x=>x!==name).join(' ');},toggle:name=>{if(this.classList.contains(name))this.classList.remove(name);else this.className+=` ${name}`;}};
 }
 get className(){return this.attributes.class??'';}
 set className(value){this.attributes.class=value;}
 get textContent(){return this.children.map(x=>typeof x==='string'?x:x.textContent).join('');}
 set textContent(value){this.children=[String(value)];}
 get innerHTML(){return this.html??'';}
 set innerHTML(html){
  this.html=html;this.children=[];const stack=[this];
  for(const token of html.match(/<[^>]+>|[^<]+/g)??[]){
   if(token.startsWith('</')){if(stack.length>1)stack.pop();continue;}
   if(token.startsWith('<')){
    const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;
    const attributes={};
    for(const match of token.slice(tag.length+1,-1).matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attributes[match[1]]=decode(match[2]??match[3]??match[4]??'');
    const parent=stack.at(-1),element=new Element(tag,attributes,parent);parent.children.push(element);
    if(!['br','input','img','hr','meta','link'].includes(tag)&&!token.endsWith('/>'))stack.push(element);
   }else stack.at(-1).children.push(decode(token));
  }
 }
 matches(selector){
  if(selector.startsWith('#'))return this.attributes.id===selector.slice(1);
  if(selector.startsWith('.'))return selector.slice(1).split('.').every(name=>this.classList.contains(name));
  const attribute=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if(attribute)return Object.hasOwn(this.attributes,attribute[1])&&(attribute[2]===undefined||this.attributes[attribute[1]]===attribute[2]);
  return this.tag===selector;
 }
 querySelectorAll(selector){
  const elements=this.children.filter(x=>x instanceof Element).flatMap(x=>[x,...x.querySelectorAll('*')]);
  if(selector==='*')return elements;
  return elements.filter(element=>selector.split(',').some(group=>{
   const parts=group.trim().split(/\s+/);if(!element.matches(parts.pop()))return false;
   let ancestor=element.parent;
   while(parts.length){const part=parts.pop();while(ancestor&&!ancestor.matches(part))ancestor=ancestor.parent;if(!ancestor)return false;ancestor=ancestor.parent;}
   return true;
  }));
 }
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 closest(selector){return selector.split(',').some(part=>this.matches(part.trim()))?this:this.parent?.closest(selector)??null;}
 focus(){this.focused=true;}
}

function harness(saved=engine.initial(),{voice=true}={}){
 const root=new Element('main',{id:'app'}),notice=new Element('p',{id:'notice'}),status=new Element('span',{id:'status'});
 const staticElements=new Map([['#app',root],['#notice',notice],['#status',status]]),listeners=new Map(),storage=new Map([[key,engine.serialize(saved)]]);
 let hold=false;const waiting=[];
 const context=vm.createContext({
  ...engine,...curriculum,...story,...lessonData,...questionHelpers,installChoiceKeyboard,choiceHint,
  URLSearchParams,location:{search:'?test'},structuredClone,
  localStorage:{getItem:name=>storage.get(name)??null,setItem:(name,value)=>storage.set(name,value)},
  navigator:{locks:{request:(_name,run)=>hold?new Promise((resolve,reject)=>waiting.push({run,resolve,reject})):Promise.resolve().then(run)}},
  document:{querySelector:selector=>staticElements.get(selector)??root.querySelector(selector),addEventListener:(type,callback,capture)=>listeners.set(capture?type+':capture':type,callback)},
  window:{scrollTo(){},addEventListener(){}},confirm:()=>true,setTimeout:()=>0,clearTimeout(){},
  stopVoice(){},speak(){},japaneseVoice:()=>voice?{name:'Test Japanese'}:null,
  mountKana(){throw Error('Kana is outside this regression harness.');}
 });
 vm.runInContext(source.replace(/^import .*;\s*$/gm,'')+`
 globalThis.app={jaMarkup,glossaryFor,begin,questionView,assessmentView,storyQuiz,submit,submitAssessment,finish,finishAssessment,navigate,shell,
  get state(){return state},get session(){return session},get assessment(){return assessment},get view(){return view},
  get pendingStart(){return pendingStart},get activeEpisode(){return activeEpisode},
  setSession(value){session=value},setAssessment(value){assessment=value}};`,context,{filename:'app.js'});
 return {
  app:context.app,root,notice,
  saved:()=>engine.restore(storage.get(key),{strict:true}),
  pause(){assert.equal(waiting.length,0);hold=true;},
  get pending(){return waiting.length;},
  async release(){assert.equal(waiting.length,1);hold=false;const next=waiting.shift();try{next.resolve(await next.run());}catch(error){next.reject(error);}},
  async click(selector){
   const button=root.querySelector(selector);assert.ok(button,`Missing rendered control: ${selector}`);assert.equal(button.disabled,false);
   const event={target:button,preventDefault(){}};
   if(button.onclick)await button.onclick(event);
   await listeners.get('click')(event);
   assert.equal(notice.textContent,'','The app must not swallow a flow error into its notice.');
  }
 };
}

function ready(){const state={...engine.initial(),role:'ren'},chapter=engine.currentChapter(state);return engine.choose(state,chapter.id,chapter.choices[0].id);}
function solve(session){while(session.queue.length){const q=session.queue[0],word=curriculum.byId.get(q.id);engine.answer(session,q.mode==='reading'?word.kana:word.meaning);}return session;}
function completeTask(state,options={}){return engine.commit(state,solve(engine.start(state,options)));}
function assessmentReady(){return completeTask(completeTask(ready()));}
function solveAssessment(session){while(session.queue.length)engine.answerAssessment(session,session.queue[0].answer);return session;}
function answerFor(session){const q=session.queue[0],word=curriculum.byId.get(q.id);return q.mode==='reading'?word.kana:word.meaning;}

for(const assessment of [false,true]){
 test(`${assessment?'submitAssessment':'submit'}：存檔等待中換頁，保存證據且不操作已移除的答題 DOM`,async()=>{
  const h=harness(assessment?assessmentReady():ready()),{app}=h;
  if(assessment)app.storyQuiz();else{app.begin();app.questionView();}
  const active=assessment?app.assessment:app.session,q=active.queue[0];
  h.pause();const result=assessment?app.submitAssessment(q.answer):app.submit(answerFor(active));
  assert.equal(h.pending,1);app.navigate('entry');assert.equal(h.root.querySelector(assessment?'#assessment-feedback':'#feedback'),null);
  const destination=h.root.innerHTML;await h.release();await assert.doesNotReject(result);
  assert.equal(h.root.innerHTML,destination);assert.equal(app.view,'entry');assert.equal(active.submitting,false);
  assert.equal(app.session,null);assert.equal(app.assessment,null);
  const evidence=h.saved().pendingSessions[active.id].evidence[q.id];
  assert.equal(assessment?evidence.correct:evidence[q.mode].correct,1);
 });

 test(`${assessment?'submitAssessment':'submit'}：同一工作階段重畫後，舊 await 不更新新題畫面`,async()=>{
  const h=harness(assessment?assessmentReady():ready()),{app}=h;
  if(assessment)app.storyQuiz();else{app.begin();app.questionView();}
  const active=assessment?app.assessment:app.session;
  h.pause();const result=assessment?app.submitAssessment(active.queue[0].answer):app.submit(answerFor(active));
  if(assessment)app.assessmentView();else app.questionView();
  const feedback=h.root.querySelector(assessment?'#assessment-feedback':'#feedback'),next=h.root.querySelector(assessment?'#assessment-next':'#next');
  await h.release();await assert.doesNotReject(result);
  assert.equal(assessment?app.assessment:app.session,active);assert.equal(feedback.textContent,'');assert.equal(next.hidden,true);
 });

 test(`${assessment?'finishAssessment':'finish'}：成果存檔等待中換頁，不蓋回舊成果`,async()=>{
  const saved=assessment?assessmentReady():ready(),h=harness(saved),{app}=h;
  const active=assessment?solveAssessment(engine.startAssessment(saved)):solve(engine.start(saved));
  if(assessment)app.setAssessment(active);else app.setSession(active);
  h.pause();const result=assessment?app.finishAssessment():app.finish();
  assert.equal(h.pending,1);app.navigate('entry');const destination=h.root.innerHTML;
  await h.release();await assert.doesNotReject(result);
  assert.equal(h.root.innerHTML,destination);assert.equal(app.view,'entry');assert.equal(h.root.querySelector('.achievement'),null);
  assert.equal(active.saving,false);assert.ok(h.saved().committedSessions.includes(active.id));
  assert.equal(assessment?app.assessment:app.session,null);
 });
}

test('零個核心任務的複習成果不揭露微劇情，主要按鈕再開一組複習',async()=>{
 const saved=completeTask(ready(),{practice:true,level:'N1'}),chapter=engine.currentChapter(saved);
 assert.equal(engine.chapterProgress(saved,chapter.id).tasksComplete,0);
 const h=harness(saved),review=solve(engine.start(saved,{review:true}));h.app.setSession(review);
 await h.app.finish();
 assert.equal(engine.chapterProgress(h.saved(),chapter.id).tasksComplete,0);
 assert.equal(h.root.querySelector('.micro-story'),null);
 const primary=h.root.querySelector('.primary');assert.equal(primary.dataset.action,'review');assert.equal(primary.textContent,'再複習一組');
 await h.click('[data-action="review"]');assert.equal(h.app.session.kind,'review');
});

test('N5 擴充待選角色後改走 N1，舊 pendingStart 不會被新角色選擇消費',async()=>{
 const h=harness();
 await h.click('[data-browse-level="N5"]');await h.click('[data-practice-level="N5"]');
 assert.equal(h.app.view,'roles');assert.equal(h.app.pendingStart.level,'N5');
 h.app.navigate('entry');assert.equal(h.app.pendingStart,null);
 await h.click('[data-entry-level="N1"]');assert.equal(h.app.view,'roles');
 await h.click('[data-role="ren"]');
 assert.equal(h.app.state.entryLevel,'N1');assert.equal(h.app.activeEpisode,'N1-1');assert.equal(h.app.view,'episode');
 assert.equal(h.app.session,null);assert.equal(h.app.pendingStart,null);assert.equal(h.saved().completed.length,0);
});

test('詞彙聽力文字替代保留原題模式與證據，答完後以文字意思入帳',async()=>{
 const h=harness(ready());h.app.begin();h.app.questionView();
 const active=h.app.session,q=active.queue[0];assert.equal(q.mode,'listening');
 await h.click('#text-mode');assert.equal(q.mode,'listening');assert.equal(q.uiFallback,true);
 assert.equal(h.root.querySelector('#text-mode'),null);assert.ok(h.root.querySelector('[data-answer]'));
 assert.equal(h.saved().pendingSessions[active.id].evidence[q.id].listening.fallback,true);
 await h.app.submit(curriculum.byId.get(q.id).meaning);
 assert.equal(h.saved().pendingSessions[active.id].evidence[q.id].listening.correct,1);
 solve(active);await h.app.finish();
 const modes=h.saved().stats[q.id].modes;assert.equal(modes.listening,undefined);assert.equal(modes.meaning.fallbacks,1);assert.equal(modes.meaning.correct,1);
});

for(const voice of [true,false]){
 test(`情境聽力${voice?'手動':'無聲線自動'}文字替代保留原模式，完成後記閱讀證據`,async()=>{
  const h=harness(assessmentReady(),{voice});h.app.storyQuiz();const active=h.app.assessment;
  while(active.queue[0].mode!=='listening'){await h.app.submitAssessment(active.queue[0].answer);}
  const q=active.queue[0];
  if(voice)await h.click('#assessment-text');else await new Promise(setImmediate);
  assert.equal(q.mode,'listening');assert.equal(q.uiFallback,true);assert.equal(h.root.querySelector('#assessment-text'),null);
  assert.ok(h.root.querySelector('.assessment-material'));
  assert.equal(h.saved().pendingSessions[active.id].evidence[q.id].fallback,true);
  await h.app.submitAssessment(q.answer);
  assert.equal(h.saved().pendingSessions[active.id].evidence[q.id].correct,1);
  solveAssessment(active);await h.app.finishAssessment();
  const record=h.saved().assessments[active.chapterId].answers.find(answer=>answer.id===q.id);
  assert.equal(record.mode,'listening');assert.equal(record.actualMode,'reading');assert.equal(record.fallback,true);
 });
}


test('振假名不把未知複合詞中的人切成ひと，已知旅人標たびびと',()=>{
 const {app}=harness();app.glossaryFor('N1-1');const html=app.jaMarkup('旅人と仕事人と人');
 assert.match(html,/<ruby>旅人<rt>たびびと<\/rt><\/ruby>/);
 assert.match(html,/仕事人と<button/);
 assert.equal((html.match(/data-gloss="人"/g)??[]).length,1);
});

test('N5實際振假名渲染涵蓋故事、微劇情及情境材料的漢字',()=>{
 const {app}=harness(),missing=[];for(const chapter of curriculum.chapters.filter(c=>c.level==='N5')){
  app.glossaryFor(chapter.id);const l=lessonData.lessons[chapter.id];
  const texts=[...chapter.paragraphs,...chapter.dialogue,...Object.values(l.beats).flat()].map(x=>x.ja);
  texts.push(l.grammar.example,...Object.values(l.checks).flat().flatMap(x=>[x.ja,...x.options]));
  for(const text of texts){const remainder=app.jaMarkup(text).replace(/<button[\s\S]*?<\/button>/g,'');if(/[\p{Script=Han}々]/u.test(remainder))missing.push(chapter.id+' '+text+' → '+remainder);}
 }
 assert.deepEqual(missing,[]);
});

for(const assessment of [false,true])test(`${assessment?'情境':'詞彙'}：答對直接換題，答錯停留解析且不接受第二次送出`,async()=>{
 const h=harness(assessment?assessmentReady():ready()),{app}=h;
 if(assessment)app.storyQuiz();else{app.begin();app.questionView();}
 const active=assessment?app.assessment:app.session;
 const oldHTML=h.root.innerHTML;
 if(assessment)await app.submitAssessment(active.queue[0].answer);else await app.submit(answerFor(active));
 assert.notEqual(h.root.innerHTML,oldHTML);
 assert.equal(h.root.querySelector(assessment?'#assessment-next':'#next').hidden,true);
 if(assessment)await app.submitAssessment(-1);else await app.submit('wrong');
 const queue=JSON.stringify(active.queue),html=h.root.innerHTML;
 assert.equal(h.root.querySelector(assessment?'#assessment-next':'#next').hidden,false);
 if(assessment)await app.submitAssessment(-1);else await app.submit('wrong');
 assert.equal(JSON.stringify(active.queue),queue);assert.equal(h.root.innerHTML,html);
 await h.click(assessment?'#assessment-next':'#next');
 assert.equal(active.awaitingExplanation,false);
});
