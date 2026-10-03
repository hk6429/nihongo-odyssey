import vocabulary from './data/vocabulary.json' with {type:'json'};
import {episodes} from './story.js';
import overrides from './data/vocabulary-overrides.json' with {type:'json'};
import {lessons} from './lessons.js';
export const levels=['N5','N4','N3','N2','N1'];
export const words=vocabulary.map(w=>({...w,...(overrides.entries[w.id]??{})}));
export const byId=new Map(words.map(w=>[w.id,w]));
// Keep the exact v2 ordering: its cursor identifies completed legacy bundles only.
export const legacyQuests=[];
export const legacyChapters=episodes.map(episode=>{
 const levelWords=words.filter(w=>w.level===episode.level),bundles=[];
 for(let i=0;i<levelWords.length;i+=5)bundles.push(levelWords.slice(i,i+5));
 const a=Math.floor(episode.index*bundles.length/5),b=Math.floor((episode.index+1)*bundles.length/5),start=legacyQuests.length;
 for(const batch of bundles.slice(a,b))legacyQuests.push({id:legacyQuests.length,episodeId:episode.id,level:episode.level,words:batch});
 return {...episode,start,end:legacyQuests.length,wordCount:legacyQuests.slice(start).reduce((n,q)=>n+q.words.length,0)};
});
export const quests=legacyQuests;
export const learningOrder=legacyQuests.flatMap(q=>q.words);
export const learnedCount=quest=>legacyQuests.slice(0,Math.max(0,quest)).reduce((n,q)=>n+q.words.length,0);
export const coreQuests=[];
export const chapters=episodes.map(episode=>{
 const lesson=lessons[episode.id],ids=lesson?.wordIds;
 if(!Array.isArray(ids)||ids.length!==10||new Set(ids).size!==10||ids.some(id=>!byId.has(id)))throw Error(`章節核心詞設定錯誤：${episode.id}`);
 const start=coreQuests.length;
 for(let i=0;i<2;i++)coreQuests.push({id:coreQuests.length,episodeId:episode.id,level:episode.level,task:i,words:ids.slice(i*5,i*5+5).map(id=>byId.get(id))});
 return {...episode,start,end:coreQuests.length,wordCount:10,lesson};
});
export const counts=Object.fromEntries(levels.map(l=>[l,words.filter(w=>w.level===l).length]));
export const chapterForQuest=q=>chapters.find(c=>q>=c.start&&q<c.end)??chapters.at(-1);
