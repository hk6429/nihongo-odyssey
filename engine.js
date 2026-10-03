import {words} from './data.js';
export const normalize = s => String(s).normalize('NFKC').trim().replace(/\s/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
export const initial = () => ({version:1,completed:0,reviews:{},kanaDone:false});
export function restore(raw) {
  let data; try { data = typeof raw === 'string' ? JSON.parse(raw):raw; } catch { return initial(); }
  if (!data || data.version!==1 || !Number.isInteger(data.completed) || data.completed<0 || data.completed>20) return initial();
  const state=initial(); state.completed=data.completed; state.kanaDone=data.kanaDone===true;
  for(const w of words.slice(0,state.completed*5)) { const t=data.reviews?.[w.id]; if(Number.isFinite(t)&&t>=0&&t<=Date.now()+86400000) state.reviews[w.id]=t; }
  return state;
}
export function start(state,reviewOnly=false,now=Date.now()) {
  const learned=words.slice(0,state.completed*5);
  const due=learned.filter(w=>!state.reviews[w.id] || now-state.reviews[w.id]>=86400000).slice(0,5);
  const fresh=reviewOnly?[]:words.slice(state.completed*5,state.completed*5+5);
  const review=reviewOnly?(due.length?due:learned.slice(-5)):due;
  return {quest:state.completed,fresh,queue:[...review.map(w=>({id:w.id,mode:'reading',review:true})),...fresh.flatMap(w=>[{id:w.id,mode:'meaning',review:false},{id:w.id,mode:'reading',review:false}])],correct:0,retries:0,reviewed:[],done:false};
}
export function answer(session,value) {
  if(!session.queue.length || session.done) return null;
  const q=session.queue.shift(), w=words.find(w=>w.id===q.id);
  const ok=q.mode==='meaning'?value===w.meaning:normalize(value)===normalize(w.kana);
  if(ok){session.correct++; if(q.review)session.reviewed.push(q.id);} else {session.queue.push(q);session.retries++;}
  session.done=session.queue.length===0;
  return {ok,expected:q.mode==='meaning'?w.meaning:w.kana};
}
export function commit(state,session,now=Date.now()) {
  if(!session.done || session.queue.length) throw Error('任務尚未完成');
  const next=restore(state);
  if(session.fresh.length && next.completed===session.quest) next.completed++;
  for(const id of [...session.reviewed,...session.fresh.map(w=>w.id)]) if(words.slice(0,next.completed*5).some(w=>w.id===id)) next.reviews[id]=now;
  return next;
}
