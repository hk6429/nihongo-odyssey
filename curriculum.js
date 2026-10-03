import vocabulary from './data/vocabulary.json' with {type:'json'};
import {episodes} from './story.js';
export const levels=['N5','N4','N3','N2','N1'];
export const words=vocabulary;
export const byId=new Map(words.map(w=>[w.id,w]));
export const quests=[];
export const chapters=episodes.map(episode=>{
  const levelWords=words.filter(w=>w.level===episode.level);
  const bundles=[];for(let i=0;i<levelWords.length;i+=5)bundles.push(levelWords.slice(i,i+5));
  const a=Math.floor(episode.index*bundles.length/5),b=Math.floor((episode.index+1)*bundles.length/5);
  const start=quests.length;
  for(const batch of bundles.slice(a,b))quests.push({id:quests.length,episodeId:episode.id,level:episode.level,words:batch});
  return {...episode,start,end:quests.length,wordCount:quests.slice(start).reduce((n,q)=>n+q.words.length,0)};
});
export const learningOrder=quests.flatMap(q=>q.words);
export const counts=Object.fromEntries(levels.map(l=>[l,words.filter(w=>w.level===l).length]));
export const learnedCount=quest=>quest>=quests.length?words.length:quests.slice(0,quest).reduce((n,q)=>n+q.words.length,0);
export const chapterForQuest=q=>chapters.find(c=>q>=c.start&&q<c.end)??chapters.at(-1);
