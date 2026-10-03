import test from 'node:test';
import assert from 'node:assert/strict';
import {words,quests,coreQuests,chapters,counts,byId,learnedCount,learningOrder} from '../curriculum.js';
import {initial,restore,choose,currentChapter,start,answer,commit,normalize,chapterProgress,startAssessment,answerAssessment,commitAssessment,statsSummary} from '../engine.js';
const ready=()=>choose({...initial(),role:'sora'},chapters[0].id,chapters[0].choices[0].id);
const solve=session=>{while(session.queue.length){const q=session.queue[0],w=byId.get(q.id);answer(session,q.mode==='reading'?w.kana:w.meaning);}return session;};
test('全詞庫10629詞保留 v2 完整排序，主線改為25章50任務250核心詞',()=>{
 assert.equal(words.length,10629);assert.deepEqual(counts,{N5:805,N4:755,N3:1813,N2:3212,N1:4044});assert.equal(chapters.length,25);
 assert.equal(new Set(words.map(w=>w.id)).size,words.length);assert.equal(learningOrder.length,words.length);assert.equal(new Set(learningOrder.map(w=>w.id)).size,words.length);
 assert.equal(learnedCount(quests.length),10629);assert.equal(coreQuests.length,50);assert.equal(new Set(coreQuests.flatMap(q=>q.words.map(w=>w.id))).size,250);
 for(const q of coreQuests)assert.equal(q.words.length,5);
 assert.equal(chapters.at(-1).end,coreQuests.length);for(let i=1;i<25;i++)assert.equal(chapters[i-1].end,chapters[i].start);
});
test('角色、抉擇及兩個核心任務為情境考驗門檻',()=>{
 assert.throws(()=>start(initial()));assert.throws(()=>start({...initial(),role:'sora'}));let s=ready();assert.throws(()=>startAssessment(s));assert.throws(()=>choose(s,chapters[2].id,'observe'));
 s=commit(s,solve(start(s)));assert.equal(chapterProgress(s).tasksComplete,1);assert.throws(()=>startAssessment(s));
 s=commit(s,solve(start(s)));assert.equal(chapterProgress(s).readyForAssessment,true);assert.equal(startAssessment(s).queue.length,3);assert.throws(()=>start(s));
});
test('錯題重排與假名容錯，不接受羅馬拼音；未完成session不能提交',()=>{
 const s=start(ready()),n=s.queue.length;assert.equal(answer(s,'錯誤').ok,false);assert.equal(s.queue.length,n);assert.throws(()=>commit(ready(),s));assert.equal(normalize('～ｹﾞﾂ'),'げつ');assert.equal(normalize(' キップ '),'きっぷ');
 const q=start(ready());answer(q,byId.get(q.queue[0].id).meaning);assert.equal(answer(q,'romajidesu').ok,false);
});
test('聽辨與文字可各自啟動，實際提示或回退由session保存',()=>{
 const s=ready(),listening=start(s,{listening:true});assert.equal(listening.queue[0].mode,'listening');assert.equal(answer(listening,byId.get(listening.queue[0].id).meaning).ok,true);assert.equal(start(s).queue[0].mode,'meaning');
});
test('兩種選擇各走25章，每章3題情境考驗，保存重載及結局',()=>{
 for(let branch=0;branch<2;branch++){
  let s={...initial(),role:'akari'},batches=0,checks=0;
  for(const c of chapters){s=choose(s,c.id,c.choices[branch].id);while(!chapterProgress(s).readyForAssessment){s=commit(s,solve(start(s)));batches++;}
   const a=startAssessment(s);assert.equal(a.queue.length,3);assert.equal(a.choice,c.choices[branch].id);
   const wrong=(a.queue[0].answer+1)%a.queue[0].options.length;assert.equal(answerAssessment(a,wrong).ok,false);assert.throws(()=>commitAssessment(s,a));
   while(a.queue.length){answerAssessment(a,a.queue[0].answer);checks++;}s=restore(JSON.stringify(commitAssessment(s,a)),{strict:true});
  }
  assert.equal(batches,50);assert.equal(checks,75);assert.equal(s.completed.length,250);assert.equal(s.cleared.length,25);assert.equal(currentChapter(s),null);assert.equal(statsSummary(s).journeyComplete,true);assert.throws(()=>start(s));
  const r=solve(start(s,{review:true}));s=commit(s,r);assert.equal(s.quest,50);
 }
});
test('完成session重複提交不計分，複習不解鎖章節，序列化session不能偽造提交',()=>{
 let s=ready(),a=solve(start(s));s=commit(s,a);const saved=structuredClone(s);assert.deepEqual(commit(s,a),saved);assert.throws(()=>commit(s,structuredClone(a)));
 const r=solve(start(s,{review:true}));s=commit(s,r);assert.equal(s.quest,1);assert.equal(s.cleared.length,0);
});
test('故事完整度、雙語、兩種抉擇回聲及角色觀點',()=>{
 for(const c of chapters){assert.ok(c.paragraphs.length>=3);assert.ok(c.paragraphs.every(p=>p.ja&&p.zh));assert.ok(c.dialogue.length);assert.equal(c.choices.length,2);for(const o of c.choices)assert.ok(o.id&&o.result&&o.echo&&o.ending);for(const role of ['sora','akari','ren'])assert.ok(c.roleNotes[role]);}assert.equal(new Set(chapters.map(c=>c.title)).size,25);
});
test('舊章session不得在進入下一章後提交，三題考驗不得重複清章',()=>{
 let s=ready();while(!chapterProgress(s).readyForAssessment)s=commit(s,solve(start(s)));
 const old=solve(start(s,{review:true})),a=startAssessment(s);while(a.queue.length)answerAssessment(a,a.queue[0].answer);s=commitAssessment(s,a);assert.strictEqual(commitAssessment(s,a),s);assert.throws(()=>commit(s,old));assert.equal(currentChapter(s).id,chapters[1].id);
});
