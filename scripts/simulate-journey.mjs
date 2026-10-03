import {writeFile,mkdir} from 'node:fs/promises';
import {initial,choose,start,answer,commit,clearChapter,restore} from '../engine.js';
import {chapters,byId,words,quests,learnedCount} from '../curriculum.js';
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
let state={...initial(),role:'ren'},answers=0;
for(const [index,chapter] of chapters.entries()){
 state=choose(state,chapter.id,chapter.choices[index%2].id);
 while(state.quest<chapter.end){const session=start(state,{listening:true});while(session.queue.length){const q=session.queue[0],word=byId.get(q.id);answer(session,q.mode==='reading'?word.kana:word.meaning);answers++;}state=commit(state,session);}
 if(index===0||index===24)await writeFile(new URL(`../artifacts/${index===0?'first-chapter-ready':'before-last-quiz'}.json`,import.meta.url),JSON.stringify(state));
 state=restore(JSON.stringify(clearChapter(state,chapter.question.answer,chapter.id).state),{strict:true});
}
const report={date:new Date().toISOString(),words:words.length,learned:learnedCount(state.quest),quests:quests.length,completedQuests:state.quest,chapters:chapters.length,cleared:state.cleared.length,choices:Object.keys(state.choices).length,answers,kind:'automated-engine-simulation',humanLearningEvidence:false};
await writeFile(new URL('../docs/journey-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
