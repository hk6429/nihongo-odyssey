import {quests,chapters,learningOrder,byId,learnedCount} from './curriculum.js';
export const normalize=s=>String(s).normalize('NFKC').trim().replace(/[\s・、。〜～~]/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
const readingVariants={'四|よん':['し'],'七|なな':['しち'],'九|きゅう':['く'],'日本|にほん':['にっぽん'],'明日|あした':['あす'],'明日|あす':['あした']};
export const acceptedReadings=w=>[w.kana,...(readingVariants[`${w.word}|${w.kana}`]??[])].map(normalize);
export const initial=()=>({version:2,quest:0,role:null,choices:{},cleared:[],reviews:{},kanaDone:false});
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
export function restore(raw,{strict=false}={}){
 let d;try{d=typeof raw==='string'?JSON.parse(raw):raw;}catch{d=null;}
 if(!object(d)||d.version!==2||!Number.isInteger(d.quest)||d.quest<0||d.quest>quests.length){if(strict)throw Error('這不是有效的新版旅程備份。');return initial();}
 const s=initial();s.quest=d.quest;s.role=['sora','akari','ren'].includes(d.role)?d.role:null;s.kanaDone=d.kanaDone===true;
 for(const c of chapters){const choice=d.choices?.[c.id];if(c.choices.some(x=>x.id===choice))s.choices[c.id]=choice;if(Array.isArray(d.cleared)&&d.cleared.includes(c.id)&&s.choices[c.id]&&s.quest>=c.end)s.cleared.push(c.id);else break;}
 // A malformed backup cannot silently skip an unresolved chapter gate.
 const gate=chapters.find(c=>!s.cleared.includes(c.id));if(gate&&s.quest>gate.end)s.quest=gate.end;
 const allowed=new Set(learningOrder.slice(0,learnedCount(s.quest)).map(w=>w.id));
 if(object(d.reviews))for(const [id,t] of Object.entries(d.reviews))if(allowed.has(id)&&Number.isFinite(t)&&t>=0&&t<=Date.now()+86400000)s.reviews[id]=t;
 if(strict&&(!object(d.choices)||!object(d.reviews)||!Array.isArray(d.cleared)||typeof d.kanaDone!=='boolean'||s.role!==d.role||s.quest!==d.quest||JSON.stringify(s.cleared)!==JSON.stringify(d.cleared)||Object.keys(s.choices).length!==Object.keys(d.choices).length||Object.entries(s.choices).some(([k,v])=>d.choices[k]!==v)||Object.keys(s.reviews).length!==Object.keys(d.reviews).length))throw Error('備份中的關卡進度不一致，未套用。');
 return s;
}
export const currentChapter=s=>chapters.find(c=>!s.cleared.includes(c.id))??null;
export function choose(s,chapterId,choiceId){const c=currentChapter(s);if(c?.id!==chapterId||!c.choices.some(x=>x.id===choiceId))throw Error('尚未抵達這一章。');if(s.choices[c.id]&&s.choices[c.id]!==choiceId)throw Error('這段抉擇已經寫入手札。');return {...s,choices:{...s.choices,[c.id]:choiceId}};}
export function clearChapter(s,choice,chapterId=currentChapter(s)?.id){const c=currentChapter(s);if(!c||c.id!==chapterId||s.quest<c.end||!s.choices[c.id])throw Error('請先完成本章詞彙任務。');if(Number(choice)!==c.question.answer)return {ok:false,state:s};return {ok:true,state:{...s,cleared:[...s.cleared,c.id]}};}
export function start(s,{review=false,listening=false,now=Date.now()}={}){
 const c=currentChapter(s);if(!review&&(!s.role||!c||!s.choices[c.id]||s.quest>=c.end))throw Error('請先閱讀劇情並完成章節抉擇。');
 const learned=learningOrder.slice(0,learnedCount(s.quest));const due=learned.filter(w=>!s.reviews[w.id]||now-s.reviews[w.id]>=86400000).slice(0,5);
 const old=review?(due.length?due:learned.slice(-5)):due;const fresh=review?[]:quests[s.quest]?.words??[];
 return {quest:s.quest,fresh,queue:[...old.map(w=>({id:w.id,mode:'reading',review:true})),...fresh.flatMap((w,i)=>[{id:w.id,mode:listening&&i%2===0?'listening':'meaning'},{id:w.id,mode:'reading'}])],reviewed:[],correct:0,retries:0,done:false};
}
export function answer(session,value){if(!session.queue.length||session.done)return null;const q=session.queue.shift(),w=byId.get(q.id);const ok=q.mode==='reading'?acceptedReadings(w).includes(normalize(value)):value===w.meaning;if(ok){session.correct++;if(q.review)session.reviewed.push(q.id);}else{session.retries++;session.queue.push(q);}session.done=session.queue.length===0;return {ok,expected:q.mode==='reading'?w.kana:w.meaning};}
export function commit(s,session,now=Date.now()){
 if(!session.done||session.queue.length)throw Error('任務尚未完成。');const n=restore(s);
 if(session.fresh.length&&n.quest===session.quest){const c=currentChapter(n);if(!c||!n.choices[c.id]||n.quest>=c.end)throw Error('章節進度已變動，請回地圖。');n.quest++;}
 const learned=new Set(learningOrder.slice(0,learnedCount(n.quest)).map(w=>w.id));for(const id of [...session.reviewed,...session.fresh.map(w=>w.id)])if(learned.has(id))n.reviews[id]=now;return n;
}
