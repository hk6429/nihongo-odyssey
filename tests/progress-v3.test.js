import test from 'node:test';
import assert from 'node:assert/strict';
import {chapters,legacyQuests,legacyChapters,learningOrder,byId,words,levels} from '../curriculum.js';
import {initial,restore,serialize,saveSessionEvidence,choose,chooseEntryLevel,currentChapter,chapterProgress,statsSummary,learnedIds,start,answer,commit,markHint,markFallback,startAssessment,answerAssessment,commitAssessment,DAY} from '../engine.js';
const now=Date.now()-5*DAY;
const ready=(level='N5')=>{let s=chooseEntryLevel({...initial(),role:'ren'},level);return choose(s,currentChapter(s).id,currentChapter(s).choices[0].id);};
const solve=a=>{while(a.queue.length){const q=a.queue[0],w=byId.get(q.id);answer(a,q.mode==='reading'?w.kana:w.meaning);}return a;};
const task=(s,t=now,options={})=>commit(s,solve(start(s,{...options,now:t})),t);
const v2=(quest=0)=>({version:2,quest,role:'sora',choices:{[chapters[0].id]:chapters[0].choices[0].id},cleared:[],reviews:{},kanaDone:false});
test('N5至N1起點：前章明示略過且完成數為零，回低階保留詞彙與統計',()=>{
 for(const [i,level] of levels.entries()){let s=ready(level);assert.equal(s.skipped.length,i*5);assert.equal(s.completed.length,0);assert.equal(s.cleared.length,0);assert.equal(currentChapter(s).level,level);assert.equal(statsSummary(s).firstIndependent,0);s=task(s);const ids=learnedIds(s),stats=structuredClone(s.stats);s=chooseEntryLevel(s,'N5');assert.deepEqual(s.completed,ids);assert.deepEqual(s.stats,stats);assert.equal(s.skipped.length,0);assert.equal(currentChapter(s).level,'N5');assert.doesNotThrow(()=>restore(s,{strict:true}));}
 assert.throws(()=>chooseEntryLevel(ready(),'N0'));
});
test('提示與首次錯答不算首次無提示；逐詞逐模式留證據，重做不能洗回true',()=>{
 let s=ready(),a=start(s,{now}),first=a.queue[0].id;markHint(a);markFallback(a);answer(a,byId.get(first).meaning);const second=a.queue[0];answer(a,'wrong');s=commit(s,solve(a),now);
 assert.equal(s.stats[first].firstIndependent,false);assert.equal(s.stats[first].hints,1);assert.equal(s.stats[first].mistakes,1);assert.equal(a.evidence[first].meaning.fallback,true);assert.equal(statsSummary(s,now).firstIndependent,4);
 s=task(s,now+1000,{review:true});assert.equal(s.stats[first].firstIndependent,false);assert.equal(s.stats[first].retainedAt,null);assert.equal(s.stats[first].modes.reading.correct>=1,true);
});
test('至少24h且本回無提示無錯答才記保留；同日錯後重做及提示不算',()=>{
 let s=task(ready()),ids=[...s.completed];s=task(s,now+DAY-1,{review:true});assert.equal(statsSummary(s).retained,0);
 let a=start(s,{review:true,now:now+2*DAY}),bad=a.queue[0].id,hinted=a.queue[1].id;answer(a,'wrong');markHint(a);s=commit(s,solve(a),now+2*DAY);
 assert.equal(s.stats[bad].retainedAt,null);assert.equal(s.stats[hinted].retainedAt,null);assert.equal(statsSummary(s).retained,3);
 s=task(s,now+2*DAY+1,{review:true});assert.equal(s.stats[bad].retainedAt,null);assert.equal(s.stats[hinted].retainedAt,null);
 s=task(s,now+3*DAY+1,{review:true});for(const id of ids)assert.equal(s.stats[id].retainedAt,now+3*DAY+1);assert.doesNotThrow(()=>restore(s,{strict:true}));
});
test('到期或最久未複習優先；每天五詞不永遠排擠後學詞，題型自動混合',()=>{
 let s=ready();s=task(s,now,{practice:true,level:'N5'});s=task(s,now+1,{practice:true,level:'N5'});s=task(s,now+2,{practice:true,level:'N5'});
 const seen=new Set();for(let n=0;n<3;n++){const a=start(s,{review:true,now:now+DAY*2+n});assert.equal(a.queue.length,5);assert.deepEqual(new Set(a.queue.map(q=>q.mode)),new Set(['reading','meaning']));for(const q of a.queue){assert.ok(!seen.has(q.id));seen.add(q.id);}s=commit(s,solve(a),now+DAY*2+n);}
 assert.equal(seen.size,15);
 const ids=[...s.completed];s.stats[ids[0]].lastReviewed=now+DAY;s.stats[ids[0]].nextDue=now+DAY*4;s.stats[ids[1]].lastReviewed=now+DAY*2;s.stats[ids[1]].nextDue=now+DAY*2;
 assert.equal(start(s,{review:true,now:now+DAY*3+10}).queue.some(q=>q.id===ids[0]),false);
});
test('延遲提交與重複提交：切換起點、重疊session不會套錯章或加分',()=>{
 let s=ready(),a=solve(start(s,{now})),b=solve(start(s,{now}));const moved=chooseEntryLevel(s,'N1');assert.throws(()=>commit(moved,a,now));s=commit(s,a,now);assert.strictEqual(commit(s,a,now),s);assert.throws(()=>commit(s,b,now));
 const incomplete=start(s,{now});assert.throws(()=>commit(s,incomplete,now));assert.equal(restore(JSON.stringify(s),{strict:true}).completed.length,5);
});
test('v2依原完整bundle回復詞ID；原cleared保留但新情境不能被跳過',()=>{
 const c=legacyChapters[0],old=v2(c.end);old.cleared=[c.id];old.reviews[learningOrder[0].id]=now;const s=restore(old,{strict:true});
 assert.equal(s.version,3);assert.equal(s.completed.length,legacyQuests.slice(0,c.end).flatMap(q=>q.words).length);assert.deepEqual(s.completed,learningOrder.slice(0,s.completed.length).map(w=>w.id));assert.deepEqual(s.cleared,[c.id]);assert.equal(s.legacyImported.version,2);assert.equal(chapterProgress(s,c.id).legacyCleared,true);assert.equal(chapterProgress(s,c.id).cleared,false);assert.equal(currentChapter(s).id,c.id);assert.equal(statsSummary(s).chaptersCleared,0);assert.equal(statsSummary(s).firstIndependent,0);assert.equal(statsSummary(s).retained,0);assert.ok(s.quest<=2);assert.notEqual(s.quest,old.quest);assert.doesNotThrow(()=>restore(s,{strict:true}));
});
test('strict v2/v3拒絕壞角色、非法詞、重複詞、虛構門檻與統計；鬆模式安全重置',()=>{
 const s=task(ready());const bad=[{...s,role:'broken'},{...s,completed:[...s.completed,s.completed[0]]},{...s,completed:['unknown']},{...s,quest:50},{...s,skipped:['N5-1']},{...s,choices:{unknown:'help'}},{...s,cleared:['N5-1']},{...s,assessments:{'N5-1':{}}},{...s,kanaDone:'yes'},{...s,stats:{...s.stats,[s.completed[0]]:{...s.stats[s.completed[0]],attempts:999}}},{...s,kana:{unknown:true}},{...v2(),quest:legacyQuests.length}, {...v2(),reviews:{unknown:now}}, {...v2(),choices:{unknown:'help'}}];
 for(const raw of bad){assert.throws(()=>restore(raw,{strict:true}));assert.deepEqual(restore(raw),initial());}assert.throws(()=>restore('{',{strict:true}));assert.throws(()=>restore({version:1},{strict:true}));assert.deepEqual(restore(JSON.stringify(s),{strict:true}),s);
});
test('三題新日語情境記錄首答/錯題/提示及文字回退，不能憑單題清章',()=>{
 let s=task(task(ready())),a=startAssessment(s,{now}),first=a.queue[0],second=a.queue[1];answerAssessment(a,first.answer);assert.throws(()=>commitAssessment(s,a,now));markHint(a);answerAssessment(a,(second.answer+1)%second.options.length,{fallback:true});while(a.queue.length)answerAssessment(a,a.queue[0].answer);s=commitAssessment(s,a,now);
 const records=s.assessments[chapters[0].id].answers;assert.equal(records.length,3);assert.equal(records[0].firstCorrect,true);assert.equal(records[1].firstCorrect,false);assert.equal(records[1].hints,1);assert.equal(records[1].mistakes,1);assert.equal(records[1].fallback,true);assert.equal(statsSummary(s).chaptersCleared,1);assert.doesNotThrow(()=>restore(s,{strict:true}));assert.strictEqual(commitAssessment(s,a,now),s);
});
test('自由練習不需主線解鎖，10629詞全庫可達且不冒充清章',()=>{
 // Every remaining word is reached through the same public five-word practice API.
 let s={...initial(),role:'sora'};for(const level of levels){while(s.completed.filter(id=>byId.get(id).level===level).length<words.filter(w=>w.level===level).length)s=task(s,now,{practice:true,level});}
 assert.equal(s.completed.length,10629);assert.equal(new Set(s.completed).size,10629);assert.equal(statsSummary(s).chaptersCleared,0);assert.equal(s.cleared.length,0);assert.equal(start(s,{practice:true,level:'N1',now}).kind,'review');assert.doesNotThrow(()=>restore(s,{strict:true}));const packed=serialize(s);assert.ok(Buffer.byteLength(packed)<2_000_000,`完整詞庫儲存 ${Buffer.byteLength(packed)} bytes`);assert.deepEqual(restore(packed,{strict:true}),s);console.log(`完整10629詞壓縮儲存：${Buffer.byteLength(packed)} bytes`);
});

test('壓縮存檔保留完整證據與去重ID，strict拒絕壞tuple或模式代碼',()=>{
 let s=task(ready()),packed=serialize(s);assert.deepEqual(restore(packed,{strict:true}),s);const raw=JSON.parse(packed),id=s.completed[0];
 for(const tuple of [[],[...raw.stats[id],0],[...raw.stats[id].slice(0,9),[[99,1,1,0,0,1,1,0,0]]],[...raw.stats[id].slice(0,9),[raw.stats[id][9][0],raw.stats[id][9][0]]]])assert.throws(()=>restore({...raw,stats:{...raw.stats,[id]:tuple}},{strict:true}));
 assert.throws(()=>restore({...raw,encoding:'unknown'},{strict:true}));
});

test('未完成作答與提示立即保存、重複保存不累加，離開重開不能洗首次無提示',()=>{
 let s=ready(),a=start(s,{now}),id=a.queue[0].id;markHint(a);answer(a,'wrong');s=saveSessionEvidence(s,a,now);s=saveSessionEvidence(s,a,now);assert.equal(s.completed.length,0);assert.equal(s.revision,a.revision);assert.equal(statsSummary(s).hints,1);assert.equal(statsSummary(s).mistakes,1);assert.throws(()=>commit(s,a,now));
 s=restore(serialize(s),{strict:true});const restarted=start(s,{now:now+1});s=commit(s,solve(restarted),now+1);assert.equal(s.stats[id].firstIndependent,false);assert.equal(s.stats[id].hints,1);assert.equal(s.stats[id].mistakes,1);assert.equal(s.stats[id].attempts,3);assert.equal(s.completed.length,5);assert.deepEqual(s.pendingSessions,{});assert.doesNotThrow(()=>restore(s,{strict:true}));
});
test('情境考驗中途離開保留最初答錯、提示與文字回退，重新答對不改成首次正確',()=>{
 let s=task(task(ready())),a=startAssessment(s,{now}),q=a.queue[0];markHint(a);markFallback(a);answerAssessment(a,(q.answer+1)%q.options.length);s=saveSessionEvidence(s,a,now);assert.equal(statsSummary(s).chaptersCleared,0);
 s=restore(serialize(s),{strict:true});a=startAssessment(s,{now:now+1});while(a.queue.length){answerAssessment(a,a.queue[0].answer);s=saveSessionEvidence(s,a,now+1);}s=commitAssessment(s,a,now+1);const result=s.assessments[chapters[0].id].answers[0];assert.equal(result.firstCorrect,false);assert.equal(result.mistakes,1);assert.equal(result.hints,1);assert.equal(result.fallback,true);assert.equal(result.attempts,2);assert.deepEqual(s.pendingSessions,{});assert.doesNotThrow(()=>restore(s,{strict:true}));
});
test('考驗首次正確後退出再答錯，保留首次正確以及後續錯誤，備份仍一致',()=>{
 let s=task(task(ready())),a=startAssessment(s,{now});answerAssessment(a,a.queue[0].answer);s=saveSessionEvidence(s,a,now);a=startAssessment(s,{now:now+1});answerAssessment(a,(a.queue[0].answer+1)%a.queue[0].options.length);while(a.queue.length)answerAssessment(a,a.queue[0].answer);s=commitAssessment(s,a,now+1);const result=s.assessments[chapters[0].id].answers[0];assert.equal(result.firstCorrect,true);assert.equal(result.mistakes,1);assert.equal(result.correct,2);assert.equal(result.attempts,3);assert.doesNotThrow(()=>restore(s,{strict:true}));
});
test('逐題保存不破壞當回24h基準；中途錯答接觸會阻止立刻重做算新保留',()=>{
 let s=task(ready()),a=start(s,{review:true,now:now+DAY});while(a.queue.length){const q=a.queue[0],w=byId.get(q.id);answer(a,q.mode==='reading'?w.kana:w.meaning);s=saveSessionEvidence(s,a,now+DAY);}s=commit(s,a,now+DAY);assert.equal(statsSummary(s).retained,5);
 a=start(s,{review:true,now:now+DAY*2});const id=a.queue[0].id;answer(a,'wrong');s=saveSessionEvidence(s,a,now+DAY*2);s=restore(serialize(s),{strict:true});s=task(s,now+DAY*2+1,{review:true});assert.equal(s.stats[id].retainedAt,now+DAY);assert.equal(s.stats[id].mistakes,1);s=task(s,now+DAY*3+1,{review:true});assert.equal(s.stats[id].retainedAt,now+DAY*3+1);assert.doesNotThrow(()=>restore(s,{strict:true}));
});

test('v2全詞庫與25章歷史完整遷移，舊詞不冒稱獨立答對或通過新檢核',()=>{
 const old={version:2,quest:legacyQuests.length,role:'akari',choices:Object.fromEntries(chapters.map(c=>[c.id,c.choices[1].id])),cleared:chapters.map(c=>c.id),reviews:{},kanaDone:true};
 const s=restore(old,{strict:true});assert.equal(s.completed.length,10629);assert.equal(s.cleared.length,25);assert.equal(Object.keys(s.choices).length,25);assert.equal(s.quest,2);assert.equal(statsSummary(s).chaptersCleared,0);assert.equal(statsSummary(s).firstIndependent,0);assert.equal(statsSummary(s).retained,0);assert.equal(currentChapter(s).id,'N5-1');assert.deepEqual(restore(serialize(s),{strict:true}),s);assert.throws(()=>restore({...v2(1),choices:{}},{strict:true}));
});

test('聽辨改文字保留作答流程，但歸入文字意思證據，不灌真正聽辨正確',()=>{
 let s=ready(),a=start(s,{listening:true,now}),id=a.queue[0].id;assert.equal(a.queue[0].mode,'listening');markFallback(a);s=saveSessionEvidence(s,a,now);answer(a,byId.get(id).meaning);s=saveSessionEvidence(s,a,now);s=commit(s,solve(a),now);assert.equal(s.stats[id].modes.listening,undefined);assert.equal(s.stats[id].modes.meaning.correct,1);assert.equal(s.stats[id].modes.meaning.fallbacks,1);assert.equal(s.stats[id].retainedAt,null);assert.doesNotThrow(()=>restore(serialize(s),{strict:true}));
 s=task(s,now);a=startAssessment(s,{now});const listening=a.queue.find(q=>q.mode==='listening');while(a.queue.length){const q=a.queue[0];if(q.mode==='listening')markFallback(a);answerAssessment(a,q.answer);}s=commitAssessment(s,a,now);const record=s.assessments[chapters[0].id].answers.find(q=>q.id===listening.id);assert.equal(record.mode,'listening');assert.equal(record.actualMode,'reading');assert.equal(record.fallback,true);assert.doesNotThrow(()=>restore(s,{strict:true}));
});
