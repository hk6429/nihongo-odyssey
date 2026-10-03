import test from 'node:test';
import assert from 'node:assert/strict';
import {words,quests,chapters,counts,byId,learnedCount,learningOrder} from '../curriculum.js';
import {initial,restore,choose,clearChapter,currentChapter,start,answer,commit,normalize} from '../engine.js';
const ready=()=>choose({...initial(),role:'sora'},chapters[0].id,chapters[0].choices[0].id);
const solve=s=>{while(s.queue.length){const q=s.queue[0],w=byId.get(q.id);answer(s,q.mode==='reading'?w.kana:w.meaning);}return s;};
test('N5至N1來源每詞恰好進一個任務，25章無遺漏',()=>{
 assert.equal(words.length,10629);assert.deepEqual(counts,{N5:805,N4:755,N3:1813,N2:3212,N1:4044});assert.equal(chapters.length,25);
 assert.equal(new Set(words.map(w=>w.id)).size,words.length);assert.equal(learningOrder.length,words.length);assert.equal(new Set(learningOrder.map(w=>w.id)).size,words.length);
 for(const q of quests)assert.ok(q.words.length>0&&q.words.length<=5);
 assert.equal(chapters.at(-1).end,quests.length);for(let i=1;i<25;i++)assert.equal(chapters[i-1].end,chapters[i].start);
});
test('必須選角色及劇情抉擇才可闖關，不能提早領印記',()=>{assert.throws(()=>start(initial()));assert.throws(()=>start({...initial(),role:'sora'}));const s=ready();assert.throws(()=>clearChapter(s,0));assert.throws(()=>choose(s,chapters[2].id,'observe'));});
test('錯題重排與假名容錯，不接受羅馬拼音',()=>{const s=start(ready());const n=s.queue.length;assert.equal(answer(s,'錯誤').ok,false);assert.equal(s.queue.length,n);assert.throws(()=>commit(ready(),s));assert.equal(normalize('～ｹﾞﾂ'),'げつ');assert.equal(normalize(' キップ '),'きっぷ');const q=start(ready());answer(q,byId.get(q.queue[0].id).meaning);assert.equal(answer(q,'ichi').ok,false);});
test('聽辨模式可答題，無聲線時可建立純文字流程',()=>{const listening=start(ready(),{listening:true});assert.equal(listening.queue[0].mode,'listening');assert.equal(answer(listening,byId.get(listening.queue[0].id).meaning).ok,true);assert.equal(start(ready()).queue[0].mode,'meaning');});
test('全部詞彙/章節/閱讀題可走完，含存檔重載與結局',()=>{
 let s={...initial(),role:'akari'};let batches=0;
 for(const c of chapters){s=choose(s,c.id,c.choices[batches%2].id);while(s.quest<c.end){s=commit(s,solve(start(s)));batches++;if(batches%31===0)s=restore(JSON.stringify(s),{strict:true});}
 const wrong=(c.question.answer+1)%c.question.options.length;assert.equal(clearChapter(s,wrong).ok,false);const result=clearChapter(s,c.question.answer);assert.equal(result.ok,true);s=restore(JSON.stringify(result.state),{strict:true});}
 assert.equal(batches,quests.length);assert.equal(learnedCount(s.quest),10629);assert.equal(s.cleared.length,25);assert.equal(Object.keys(s.choices).length,25);assert.equal(currentChapter(s),null);assert.throws(()=>start(s));
 const r=solve(start(s,{review:true}));s=commit(s,r);assert.equal(s.quest,quests.length);
});
test('重複任務提交不加分，複習不影響解鎖',()=>{let s=ready(),a=solve(start(s));s=commit(s,a);s=commit(s,a);assert.equal(s.quest,1);const r=solve(start(s,{review:true,now:Date.now()+90000000}));s=commit(s,r);assert.equal(s.quest,1);assert.equal(s.cleared.length,0);});
test('舊版與損壞存檔不錯誤匯入；備份需通過章節門檻',()=>{assert.deepEqual(restore({version:1,completed:20}),initial());assert.throws(()=>restore('{',{strict:true}));assert.throws(()=>restore({...initial(),quest:quests.length},{strict:true}));assert.throws(()=>restore({...initial(),quest:999999},{strict:true}));});
test('故事完整度、日中對照、選項回聲與角色觀點',()=>{for(const c of chapters){assert.ok(c.paragraphs.length>=3);assert.ok(c.paragraphs.every(p=>p.ja&&p.zh));assert.ok(c.dialogue.length);assert.equal(c.choices.length,2);for(const o of c.choices)assert.ok(o.id&&o.result&&o.echo&&o.ending);assert.ok(c.question.options[c.question.answer]);for(const role of ['sora','akari','ren'])assert.ok(c.roleNotes[role]);}assert.equal(new Set(chapters.map(c=>c.title)).size,25);});
test('嚴格備份拒絕損壞的角色、抉擇與複習，不默默刪除',()=>{const s=ready();for(const raw of [{...s,role:'broken'},{...s,choices:{...s.choices,unknown:'help'}},{...s,reviews:{bad:Date.now()}},{...s,kanaDone:'yes'}])assert.throws(()=>restore(raw,{strict:true}));});
test('舊章節的答案不得套用到下一章',()=>{const c=chapters[0];let s=ready();while(s.quest<c.end)s=commit(s,solve(start(s)));s=clearChapter(s,c.question.answer,c.id).state;const n=chapters[1];s=choose(s,n.id,n.choices[0].id);while(s.quest<n.end)s=commit(s,solve(start(s)));assert.throws(()=>clearChapter(s,n.question.answer,c.id));assert.equal(clearChapter(s,n.question.answer,n.id).ok,true);});
