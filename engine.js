import {chapters,coreQuests,legacyQuests,legacyChapters,learningOrder,byId,words,levels,learnedCount} from './curriculum.js';
import {normalizeKanaProgress} from './kana.js';
export const normalize=s=>String(s).normalize('NFKC').trim().replace(/[\s・、。〜～~]/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
const readingVariants={'四|よん':['し'],'七|なな':['しち'],'九|きゅう':['く'],'日本|にほん':['にっぽん'],'明日|あした':['あす'],'明日|あす':['あした']};
export const acceptedReadings=w=>[w.kana,...(readingVariants[`${w.word}|${w.kana}`]??[])].map(normalize);
export const DAY=86400000;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const time=x=>integer(x)&&x<=Date.now()+DAY;
const canonical=x=>Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const assert=(condition,message='備份中的進度或作答紀錄不一致，未套用。')=>{if(!condition)throw Error(message);};
const chapterMap=new Map(chapters.map(c=>[c.id,c]));
const validRoles=['sora','akari','ren'];
const newId=()=>globalThis.crypto.randomUUID();
const canonicalSkipped=(level,assessments)=>chapters.filter(c=>levels.indexOf(c.level)<levels.indexOf(level)&&!assessments[c.id]).map(c=>c.id);
const clearedNew=(s,id)=>Boolean(s.assessments[id]);
export const initial=()=>({version:3,role:null,entryLevel:'N5',skipped:[],choices:{},cleared:[],completed:[],stats:{},assessments:{},pendingSessions:{},committedSessions:[],revision:0,kanaDone:false,kana:normalizeKanaProgress({}),legacyImported:null,quest:0});
export const learnedIds=s=>[...s.completed];
export const currentChapter=s=>chapters.find(c=>!s.skipped.includes(c.id)&&!clearedNew(s,c.id))??null;
export function chapterProgress(s,chapterId=currentChapter(s)?.id){
 const c=chapterMap.get(chapterId),completed=new Set(s.completed);
 if(!c)return {completed:0,total:0,tasksComplete:0,tasksTotal:0,nextTask:null,readyForAssessment:false,cleared:false,skipped:false,legacyCleared:false};
 const tasks=coreQuests.slice(c.start,c.end),finished=tasks.map(q=>q.words.every(w=>completed.has(w.id)));
 return {completed:c.lesson.wordIds.filter(id=>completed.has(id)).length,total:10,tasksComplete:finished.filter(Boolean).length,tasksTotal:2,nextTask:finished.indexOf(false)<0?null:finished.indexOf(false),readyForAssessment:finished.every(Boolean),cleared:clearedNew(s,c.id),skipped:s.skipped.includes(c.id),legacyCleared:s.legacyImported?.cleared.includes(c.id)??false};
}
function sync(s){s.skipped=canonicalSkipped(s.entryLevel,s.assessments);const c=currentChapter(s);s.quest=c?c.start+(chapterProgress(s,c.id).nextTask??2):coreQuests.length;return s;}
export function statsSummary(s,now=Date.now()){
 const records=s.completed.map(id=>s.stats[id]);
 const chaptersCleared=Object.keys(s.assessments).length;
 const pending=Object.values(s.pendingSessions).filter(p=>p.kind!=='assessment').flatMap(p=>Object.values(p.evidence).flatMap(modes=>Object.values(modes)));
 return {completed:s.completed.length,firstIndependent:records.filter(x=>x.firstIndependent).length,retained:records.filter(x=>x.retainedAt!==null).length,due:records.filter(x=>x.nextDue<=now).length,hints:[...records,...pending].reduce((n,x)=>n+x.hints,0),mistakes:[...records,...pending].reduce((n,x)=>n+x.mistakes,0),chaptersCleared,skipped:s.skipped.length,routeComplete:currentChapter(s)===null,journeyComplete:chaptersCleared===chapters.length};
}
const emptyStats=(completedAt=null,lastReviewed=null)=>({completedAt,lastReviewed,nextDue:lastReviewed===null?0:lastReviewed+DAY,firstIndependent:false,hints:0,mistakes:0,attempts:0,correct:0,retainedAt:null,modes:{}});
function readStats(x){
 assert(object(x)&&['completedAt','lastReviewed','retainedAt'].every(k=>x[k]===null||time(x[k]))&&integer(x.nextDue)&&x.nextDue<=Date.now()+DAY*8&&typeof x.firstIndependent==='boolean');
 assert(['hints','mistakes','attempts','correct'].every(k=>integer(x[k]))&&x.correct+x.mistakes===x.attempts&&object(x.modes));
 if(x.completedAt!==null)assert(x.lastReviewed!==null&&x.lastReviewed>=x.completedAt&&x.attempts>0);
 if(x.lastReviewed===null)assert(x.nextDue===0);else assert([DAY,DAY/4].includes(x.nextDue-x.lastReviewed));
 if(x.retainedAt!==null)assert(x.completedAt!==null&&x.retainedAt>=x.completedAt+DAY&&x.lastReviewed>=x.retainedAt);
 const modes={};
 for(const [mode,m] of Object.entries(x.modes)){
  assert(['meaning','reading','listening'].includes(mode)&&object(m)&&['attempts','correct','mistakes','hints','firstCorrect','firstIndependent','retained','fallbacks'].every(k=>integer(m[k]))&&m.correct+m.mistakes===m.attempts&&m.firstCorrect<=m.correct&&m.firstIndependent<=m.firstCorrect&&m.retained<=m.firstIndependent);
  modes[mode]={...m};
 }
 for(const field of ['attempts','correct','mistakes','hints'])assert(Object.values(modes).reduce((n,m)=>n+m[field],0)===x[field]);
 if(x.firstIndependent)assert(x.completedAt!==null&&modes.reading?.firstIndependent>=1&&((modes.meaning?.firstIndependent??0)+(modes.listening?.firstIndependent??0))>=1);
 return {...x,modes};
}
function migrateV2(d){
 assert(integer(d.quest)&&d.quest<=legacyQuests.length&&(d.role===null||validRoles.includes(d.role))&&object(d.choices)&&object(d.reviews)&&Array.isArray(d.cleared)&&typeof d.kanaDone==='boolean');
 const s=initial();s.role=d.role;s.kanaDone=d.kanaDone;
 assert(new Set(d.cleared).size===d.cleared.length);
 for(const [id,choice] of Object.entries(d.choices)){const c=chapterMap.get(id);assert(c&&c.choices.some(x=>x.id===choice));s.choices[id]=choice;}
 if(d.quest>0)assert(s.role&&legacyQuests.slice(0,d.quest).every(q=>s.choices[q.episodeId]));
 const allowedCleared=[];
 for(const c of legacyChapters){if(d.cleared.includes(c.id)&&s.choices[c.id]&&d.quest>=c.end)allowedCleared.push(c.id);else break;}
 assert(same(allowedCleared,d.cleared));
 const gate=legacyChapters.find(c=>!allowedCleared.includes(c.id));assert(!gate||d.quest<=gate.end);
 for(const id of Object.keys(d.choices)){const c=legacyChapters.find(c=>c.id===id);assert(d.quest>=c.start);}
 s.completed=learningOrder.slice(0,learnedCount(d.quest)).map(w=>w.id);
 const allowed=new Set(s.completed);
 for(const [id,t] of Object.entries(d.reviews))assert(allowed.has(id)&&time(t));
 for(const id of s.completed)s.stats[id]=emptyStats(null,d.reviews[id]??null);
 s.cleared=[...d.cleared];s.legacyImported={version:2,completed:s.completed.length,cleared:[...d.cleared]};
 return sync(s);
}
function readV3(d){
 assert((d.role===null||validRoles.includes(d.role))&&levels.includes(d.entryLevel)&&typeof d.kanaDone==='boolean'&&integer(d.revision)&&integer(d.quest));
 assert(['skipped','cleared','completed','committedSessions'].every(k=>Array.isArray(d[k])&&new Set(d[k]).size===d[k].length));
 assert(object(d.choices)&&object(d.stats)&&object(d.assessments)&&object(d.pendingSessions)&&object(d.kana));
 const s=initial();Object.assign(s,{role:d.role,entryLevel:d.entryLevel,kanaDone:d.kanaDone,revision:d.revision});
 s.kana=normalizeKanaProgress(d.kana);assert(same(s.kana,d.kana));
 for(const [id,choice] of Object.entries(d.choices)){const c=chapterMap.get(id);assert(c&&c.choices.some(x=>x.id===choice));s.choices[id]=choice;}
 assert(d.completed.every(id=>typeof id==='string'&&byId.has(id))&&Object.keys(d.stats).length===d.completed.length);
 s.completed=[...d.completed];for(const id of s.completed)s.stats[id]=readStats(d.stats[id]);
 if(d.legacyImported!==null){
  const old=d.legacyImported;assert(object(old)&&old.version===2&&integer(old.completed)&&old.completed<=s.completed.length&&Array.isArray(old.cleared)&&new Set(old.cleared).size===old.cleared.length&&old.cleared.every(id=>chapterMap.has(id)&&s.choices[id]));
  s.legacyImported={version:2,completed:old.completed,cleared:[...old.cleared]};
 }
 const legacyIds=new Set(learningOrder.slice(0,s.legacyImported?.completed??0).map(w=>w.id));
 assert([...legacyIds].every(id=>s.completed.includes(id)));
 for(const id of s.completed)if(!legacyIds.has(id)){const x=s.stats[id];assert(x.completedAt!==null&&x.modes.reading?.correct>=1&&((x.modes.meaning?.correct??0)+(x.modes.listening?.correct??0))>=1);}
 for(const [id,a] of Object.entries(d.assessments)){
  const c=chapterMap.get(id);assert(c&&object(a)&&s.choices[id]===a.choice&&time(a.completedAt)&&Array.isArray(a.answers)&&a.answers.length===3&&chapterProgress(s,id).readyForAssessment);
  const checks=c.lesson.checks[a.choice];
  assert(checks?.length===3);
  for(let i=0;i<checks.length;i++){const r=a.answers[i],q=checks[i];assert(object(r)&&r.id===q.id&&r.mode===q.mode&&r.actualMode===(q.mode==='listening'&&r.fallback?'reading':q.mode)&&typeof r.firstCorrect==='boolean'&&typeof r.fallback==='boolean'&&integer(r.hints)&&integer(r.mistakes)&&integer(r.attempts)&&integer(r.correct)&&r.correct>=1&&r.attempts===r.mistakes+r.correct&&(r.firstCorrect?r.correct>=1:r.mistakes>=1));}
  s.assessments[id]=structuredClone(a);
 }
 const requiredCleared=new Set([...(s.legacyImported?.cleared??[]),...Object.keys(s.assessments)]);
 assert(d.cleared.length===requiredCleared.size&&d.cleared.every(id=>requiredCleared.has(id)));
 s.cleared=[...d.cleared];
 s.pendingSessions=readPending(d.pendingSessions);
 assert(d.committedSessions.every(id=>typeof id==='string'&&id.length>=8&&id.length<=100));s.committedSessions=[...d.committedSessions];assert(s.committedSessions.every(id=>!s.pendingSessions[id]));
 sync(s);assert(same(d.skipped,s.skipped)&&d.quest===s.quest);
 return s;
}
function checkEvidence(e){
 assert(object(e)&&['attempts','correct','mistakes','hints'].every(k=>integer(e[k]))&&e.correct<=1&&e.attempts===e.correct+e.mistakes&&typeof e.fallback==='boolean');
 assert(e.attempts===0?e.firstCorrect===null:typeof e.firstCorrect==='boolean'&&(e.firstCorrect?e.correct>=1:e.mistakes>=1));
}
function readPending(pending){
 const result={};
 for(const [id,p] of Object.entries(pending)){
  assert(typeof id==='string'&&id.length>=8&&id.length<=100&&object(p)&&['core','practice','review','assessment'].includes(p.kind)&&(p.chapterId===null||chapterMap.has(p.chapterId))&&time(p.startedAt)&&time(p.lastAt)&&p.lastAt>=p.startedAt&&object(p.evidence));
  if(p.kind==='assessment'){
   const c=chapterMap.get(p.chapterId);assert(c&&c.choices.some(x=>x.id===p.choice));const checks=c.lesson.checks[p.choice];
   for(const [qid,e] of Object.entries(p.evidence)){const q=checks.find(x=>x.id===qid);assert(q&&e.id===qid&&e.mode===q.mode);checkEvidence(e);}
  }else{
   assert(p.choice===null);for(const [wid,modes] of Object.entries(p.evidence)){assert(byId.has(wid)&&object(modes));for(const [mode,e] of Object.entries(modes)){assert(['meaning','reading','listening'].includes(mode));checkEvidence(e);}}
  }
  result[id]=structuredClone(p);
 }
 return result;
}
const touched=e=>e.attempts>0||e.hints>0||e.fallback;
function snapshot(session,now){
 const evidence={};
 for(const [id,value] of Object.entries(session.evidence)){
  if(session.kind==='assessment'){if(touched(value))evidence[id]={...value};}
  else{const modes=Object.fromEntries(Object.entries(value).filter(([,e])=>touched(e)).map(([mode,e])=>[mode,{...e}]));if(Object.keys(modes).length)evidence[id]=modes;}
 }
 return {kind:session.kind,chapterId:session.chapterId,choice:session.choice??null,startedAt:session.startedAt,lastAt:now,evidence};
}
export function saveSessionEvidence(s,session,now=Date.now()){
 assert(sessions.has(session),'練習工作階段無效。');if(s.committedSessions.includes(session.id))return s;
 assert(s.revision===session.revision&&(currentChapter(s)?.id??null)===session.chapterId&&time(now)&&now>=session.startedAt,'進度已變動，無法保存這次作答。');
 const saved=snapshot(session,now);if(!Object.keys(saved.evidence).length)return s;
 const n={...s,pendingSessions:{...s.pendingSessions,[session.id]:saved},stats:{...s.stats}};
 if(session.kind!=='assessment')for(const [id,modes] of Object.entries(saved.evidence))if(n.stats[id]){const assisted=Object.values(modes).some(e=>e.hints||e.mistakes);n.stats[id]={...n.stats[id],lastReviewed:now,nextDue:now+(assisted?DAY/4:DAY)};}
 return n;
}
function addEvidence(target,source){
 const counts={firstCorrectCount:Number(source.correct>0&&source.firstCorrect),independentCount:Number(source.correct>0&&source.firstCorrect&&source.hints===0&&source.mistakes===0),fallbackCount:Number(source.fallback)};
 if(!target)return {...source,...counts};
 const merged={...target};for(const k of ['attempts','correct','mistakes','hints'])merged[k]+=source[k];for(const k of Object.keys(counts))merged[k]+=counts[k];
 if(merged.firstCorrect===null)merged.firstCorrect=source.firstCorrect;merged.fallback||=source.fallback;return merged;
}
function pendingWithCurrent(s,session){
 return Object.entries({...s.pendingSessions,[session.id]:snapshot(session,session.startedAt)}).sort((a,b)=>a[1].startedAt-b[1].startedAt);
}
const actualWordMode=(mode,e)=>mode==='listening'&&e.fallback?'meaning':mode;
function mergeWordEvidence(s,session){
 const result={};for(const [,p] of pendingWithCurrent(s,session))if(p.kind!=='assessment')for(const id of session.wordIds){if(!p.evidence[id])continue;result[id]??={};for(const [mode,e] of Object.entries(p.evidence[id])){const actual=actualWordMode(mode,e);result[id][actual]=addEvidence(result[id][actual],e);}}
 return result;
}
function mergeAssessmentEvidence(s,session){
 const result={};for(const [,p] of pendingWithCurrent(s,session))if(p.kind==='assessment'&&p.chapterId===session.chapterId&&p.choice===session.choice)for(const [id,e] of Object.entries(p.evidence))result[id]=addEvidence(result[id],e);return result;
}
function discardPending(s,session){
 for(const [id,p] of Object.entries(s.pendingSessions)){
  if(session.kind==='assessment'){if(p.kind==='assessment'&&p.chapterId===session.chapterId&&p.choice===session.choice)delete s.pendingSessions[id];}
  else if(p.kind!=='assessment'){for(const wid of session.wordIds)delete p.evidence[wid];if(!Object.keys(p.evidence).length)delete s.pendingSessions[id];}
 }
}
const statFields=['completedAt','lastReviewed','nextDue','firstIndependent','hints','mistakes','attempts','correct','retainedAt'];
const modeNames=['meaning','reading','listening'];
const modeFields=['attempts','correct','mistakes','hints','firstCorrect','firstIndependent','retained','fallbacks'];
// Storage tuples keep all evidence while leaving exported backups human-readable.
export function serialize(s){
 assert(s.version===3&&object(s.stats));
 const packed=Object.fromEntries(Object.entries(s.stats).map(([id,x])=>[id,[...statFields.map(k=>x[k]),Object.entries(x.modes).map(([mode,m])=>[modeNames.indexOf(mode),...modeFields.map(k=>m[k])])]]));
 return JSON.stringify({...s,encoding:'stats-tuples-v1',stats:packed});
}
function unpack(d){
 assert(d.encoding==='stats-tuples-v1'&&d.version===3&&object(d.stats));
 const stats={};
 for(const [id,tuple] of Object.entries(d.stats)){
  assert(Array.isArray(tuple)&&tuple.length===10&&Array.isArray(tuple[9]));const x=Object.fromEntries(statFields.map((key,i)=>[key,tuple[i]]));x.modes={};
  for(const row of tuple[9]){assert(Array.isArray(row)&&row.length===9&&Number.isInteger(row[0])&&modeNames[row[0]]&&!Object.hasOwn(x.modes,modeNames[row[0]]));x.modes[modeNames[row[0]]]=Object.fromEntries(modeFields.map((key,i)=>[key,row[i+1]]));}
  stats[id]=x;
 }
 const result={...d,stats};delete result.encoding;return result;
}
export function restore(raw,{strict=false}={}){
 try{let d=typeof raw==='string'?JSON.parse(raw):raw;assert(object(d));if(d.encoding!==undefined)d=unpack(d);if(d.version===2)return migrateV2(d);assert(d.version===3);return readV3(d);}catch(error){if(strict)throw Error(`無法匯入：${error.message}`);return initial();}
}
export function chooseEntryLevel(s,level){assert(levels.includes(level),'請選擇 N5～N1 的起點。');if(s.entryLevel===level)return s;return sync({...s,entryLevel:level,revision:s.revision+1});}
export function choose(s,chapterId,choiceId){const c=currentChapter(s);assert(c?.id===chapterId&&c.choices.some(x=>x.id===choiceId),'尚未抵達這一章。');assert(!s.choices[c.id]||s.choices[c.id]===choiceId,'這段抉擇已經寫入手札。');if(s.choices[c.id]===choiceId)return s;return {...s,choices:{...s.choices,[c.id]:choiceId},revision:s.revision+1};}
function selectReview(s,now,level){
 return s.completed.filter(id=>!level||byId.get(id).level===level).map(id=>byId.get(id)).sort((a,b)=>{
  const x=s.stats[a.id],y=s.stats[b.id],dueX=x.nextDue<=now,dueY=y.nextDue<=now;
  return Number(dueY)-Number(dueX)||(x.lastReviewed??0)-(y.lastReviewed??0)||x.nextDue-y.nextDue||a.id.localeCompare(b.id);
 }).slice(0,5);
}
const sessions=new WeakSet();
function baseSession(s,kind,now){const session={id:newId(),kind,revision:s.revision,chapterId:currentChapter(s)?.id??null,startedAt:now,queue:[],done:false,correct:0,retries:0};sessions.add(session);return session;}
export function start(s,{review=false,listening=false,practice=false,level=s.entryLevel,now=Date.now()}={}){
 assert(time(now),'練習時間無效。');assert(levels.includes(level),'無效的練習級別。');
 const c=currentChapter(s),completed=new Set(s.completed);let fresh=[],old=[],task=null,kind=review?'review':practice?'practice':'core';
 if(kind==='core'){
  assert(s.role&&c&&s.choices[c.id]&&!chapterProgress(s,c.id).readyForAssessment,'請先閱讀劇情並完成章節抉擇。');
  task=c.start+chapterProgress(s,c.id).nextTask;fresh=coreQuests[task].words.filter(w=>!completed.has(w.id));
 }else if(kind==='practice'){
  assert(s.role,'請先選擇角色。');fresh=words.filter(w=>w.level===level&&!completed.has(w.id)).slice(0,5);
  if(!fresh.length){kind='review';old=selectReview(s,now,level);}
 }else old=selectReview(s,now);
 assert(fresh.length||old.length,'目前沒有可複習的詞，請先完成一個詞彙任務。');
 const session=baseSession(s,kind,now);Object.assign(session,{quest:s.quest,task,level,fresh,reviewed:[],evidence:{},wordIds:[...old,...fresh].map(w=>w.id),reviewBaselines:Object.fromEntries(old.map(w=>[w.id,s.stats[w.id].lastReviewed]))});
 session.queue=[...old.map((w,i)=>({id:w.id,mode:i%2===0?'reading':'meaning',review:true})),...fresh.flatMap((w,i)=>[{id:w.id,mode:listening&&i%2===0?'listening':'meaning',review:false},{id:w.id,mode:'reading',review:false}])];
 for(const q of session.queue){session.evidence[q.id]??={};session.evidence[q.id][q.mode]={attempts:0,correct:0,mistakes:0,hints:0,firstCorrect:null,fallback:false};}
 return session;
}
export function markHint(session){const q=session.queue[0];if(!q||session.done)return;const e=session.kind==='assessment'?session.evidence[q.id]:session.evidence[q.id][q.mode];e.hints++;}
export function markFallback(session){const q=session.queue[0];if(!q||session.done)return;const e=session.kind==='assessment'?session.evidence[q.id]:session.evidence[q.id][q.mode];e.fallback=true;}
export function answer(session,value){
 assert(sessions.has(session)&&session.kind!=='assessment','練習工作階段無效。');if(!session.queue.length||session.done)return null;
 const q=session.queue.shift(),w=byId.get(q.id),e=session.evidence[q.id][q.mode];
 const ok=q.mode==='reading'?acceptedReadings(w).includes(normalize(value)):value===w.meaning;
 e.attempts++;if(e.firstCorrect===null)e.firstCorrect=ok;
 if(ok){e.correct++;session.correct++;if(q.review)session.reviewed.push(q.id);}else{e.mistakes++;session.retries++;session.queue.push(q);}
 session.done=session.queue.length===0;return {ok,expected:q.mode==='reading'?w.kana:w.meaning};
}
function canCommit(s,session){
 assert(sessions.has(session),'練習工作階段無效。');if(s.committedSessions.includes(session.id))return false;
 assert(session.done&&!session.queue.length,'任務尚未完成。');
 assert(s.revision===session.revision&&(currentChapter(s)?.id??null)===session.chapterId,'進度已變動，請重新開始練習。');
 return true;
}
export function commit(s,session,now=Date.now()){
 assert(session.kind!=='assessment','情境考驗請使用專屬提交。');if(!canCommit(s,session))return s;assert(time(now)&&now>=session.startedAt,'提交時間無效。');
 const n={...s,completed:[...s.completed],stats:{...s.stats},pendingSessions:structuredClone(s.pendingSessions),committedSessions:[...s.committedSessions]},completed=new Set(n.completed);
 const merged=mergeWordEvidence(s,session);
 for(const id of session.wordIds){
  const current=Object.values(session.evidence[id]),actualCurrent=Object.fromEntries(Object.entries(session.evidence[id]).map(([mode,e])=>[actualWordMode(mode,e),e]));assert(current.length&&current.every(e=>e.correct===1),'作答證據不完整。');const evidence=Object.entries(merged[id]);
  const isFresh=!completed.has(id),previous=n.stats[id]??emptyStats(),x=structuredClone(previous),independent=evidence.every(([,e])=>e.firstCorrect&&e.hints===0&&e.mistakes===0);
  const baseline=session.reviewBaselines[id];const retained=!isFresh&&x.completedAt!==null&&baseline!==null&&baseline!==undefined&&now-Math.max(x.completedAt??0,baseline)>=DAY&&current.every(e=>e.firstCorrect&&e.hints===0&&e.mistakes===0);
  if(isFresh){x.completedAt=now;x.firstIndependent=independent&&evidence.some(([m])=>m==='reading')&&evidence.some(([m])=>m==='meaning'||m==='listening');n.completed.push(id);completed.add(id);}
  // Unknown v2 completion dates obtain a known baseline on their first new review.
  if(x.completedAt===null)x.completedAt=now;
  if(retained&&now-x.completedAt>=DAY)x.retainedAt=now;
  for(const [mode,e] of evidence){
   const m=x.modes[mode]??{attempts:0,correct:0,mistakes:0,hints:0,firstCorrect:0,firstIndependent:0,retained:0,fallbacks:0};
   for(const key of ['attempts','correct','mistakes','hints']){x[key]+=e[key];m[key]+=e[key];}
   m.firstCorrect+=e.firstCorrectCount;m.firstIndependent+=e.independentCount;if(retained&&actualCurrent[mode]?.correct===1)m.retained++;m.fallbacks+=e.fallbackCount;x.modes[mode]=m;
  }
  x.lastReviewed=now;x.nextDue=now+(current.every(e=>e.firstCorrect&&e.hints===0&&e.mistakes===0)?DAY:Math.floor(DAY/4));n.stats[id]=x;
 }
 discardPending(n,session);n.committedSessions.push(session.id);n.revision++;return sync(n);
}
export function startAssessment(s,{now=Date.now()}={}){
 const c=currentChapter(s);assert(s.role&&c&&s.choices[c.id]&&chapterProgress(s,c.id).readyForAssessment,'請先完成本章兩個核心詞彙任務。');assert(time(now),'考驗時間無效。');
 const checks=c.lesson.checks[s.choices[c.id]];assert(checks?.length===3,'本章情境考驗設定錯誤。');
 const session=baseSession(s,'assessment',now);Object.assign(session,{choice:s.choices[c.id],queue:structuredClone(checks),answers:[],evidence:{}});
 for(const q of checks)session.evidence[q.id]={id:q.id,mode:q.mode,firstCorrect:null,hints:0,mistakes:0,attempts:0,correct:0,fallback:false};return session;
}
export function answerAssessment(session,index,{fallback=false}={}){
 assert(sessions.has(session)&&session.kind==='assessment','考驗工作階段無效。');if(!session.queue.length||session.done)return null;
 const q=session.queue.shift(),e=session.evidence[q.id],ok=(typeof index==='number'||typeof index==='string'&&/^\d+$/.test(index))&&Number.isInteger(Number(index))&&Number(index)===q.answer;
 e.attempts++;e.fallback||=fallback;if(e.firstCorrect===null)e.firstCorrect=ok;
 if(ok){e.correct++;session.correct++;session.answers.push({...e});}else{e.mistakes++;session.retries++;session.queue.push(q);}
 session.done=session.queue.length===0;return {ok,expected:q.options[q.answer],explanation:q.explanation};
}
export function commitAssessment(s,session,now=Date.now()){
 assert(session.kind==='assessment','考驗工作階段無效。');if(!canCommit(s,session))return s;
 const c=currentChapter(s);assert(c?.id===session.chapterId&&s.choices[c.id]===session.choice&&chapterProgress(s,c.id).readyForAssessment&&time(now)&&now>=session.startedAt,'情境考驗進度已變動。');
 const checks=c.lesson.checks[session.choice];assert(session.answers.length===3&&new Set(session.answers.map(a=>a.id)).size===3&&checks.every(q=>session.answers.some(a=>a.id===q.id)),'請完成全部三題情境考驗。');
 const n={...s,assessments:{...s.assessments},pendingSessions:structuredClone(s.pendingSessions),cleared:[...s.cleared],committedSessions:[...s.committedSessions]};const evidence=mergeAssessmentEvidence(s,session);n.assessments[c.id]={choice:session.choice,answers:checks.map(q=>({...Object.fromEntries(['id','mode','firstCorrect','hints','mistakes','attempts','correct','fallback'].map(k=>[k,evidence[q.id][k]])),actualMode:q.mode==='listening'&&evidence[q.id].fallback?'reading':q.mode})),completedAt:now};
 if(!n.cleared.includes(c.id))n.cleared.push(c.id);discardPending(n,session);n.committedSessions.push(session.id);n.revision++;return sync(n);
}

// Merge only validated account snapshots; evidence counters are never added twice.
export function mergeCloudProgress(local,remote,{preferLocalProfile=false}={}){
 local=restore(local,{strict:true});if(!remote)return local;remote=restore(remote,{strict:true});
 const profile=preferLocalProfile?local:remote,other=profile===local?remote:local;
 const merged=structuredClone(profile);
 merged.completed=[...new Set([...local.completed,...remote.completed])];
 for(const id of merged.completed){const a=local.stats[id],b=remote.stats[id];merged.stats[id]=structuredClone(!a?b:!b?a:(a.lastReviewed??0)>(b.lastReviewed??0)?a:(a.lastReviewed??0)<(b.lastReviewed??0)?b:a.attempts>b.attempts?a:b);}
 merged.choices={...other.choices,...profile.choices};
 merged.assessments={...other.assessments,...profile.assessments};
 for(const [id,a] of Object.entries(merged.assessments))merged.choices[id]=a.choice;
 merged.legacyImported=structuredClone((local.legacyImported?.completed??0)>(remote.legacyImported?.completed??0)?local.legacyImported:remote.legacyImported);
 merged.cleared=[...new Set([...(merged.legacyImported?.cleared??[]),...Object.keys(merged.assessments)])];
 merged.committedSessions=[...new Set([...local.committedSessions,...remote.committedSessions])];
 merged.pendingSessions={...other.pendingSessions,...profile.pendingSessions};
 for(const [id,p] of Object.entries(other.pendingSessions))if(p.lastAt>(merged.pendingSessions[id]?.lastAt??0))merged.pendingSessions[id]=p;
 for(const id of merged.committedSessions)delete merged.pendingSessions[id];
 merged.kanaDone=local.kanaDone||remote.kanaDone;
 merged.kana.units=structuredClone(other.kana.units);
 for(const [id,u] of Object.entries(profile.kana.units)){
  const o=merged.kana.units[id];if(!o){merged.kana.units[id]=structuredClone(u);continue;}
  const items={...o.items};for(const [key,r] of Object.entries(u.items))if(!items[key]||(r.lastAt??0)>=(items[key].lastAt??0))items[key]=r;
  merged.kana.units[id]={...u,demoSeen:u.demoSeen||o.demoSeen,completedAt:u.completedAt||o.completedAt,practiceCount:Math.max(u.practiceCount,o.practiceCount),items};
 }
 merged.kana=normalizeKanaProgress(merged.kana);
 merged.revision=Math.max(local.revision,remote.revision);
 return restore(sync(merged),{strict:true});
}
