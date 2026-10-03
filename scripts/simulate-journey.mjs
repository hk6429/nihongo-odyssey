import {writeFile,mkdir} from 'node:fs/promises';
import {initial,choose,start,answer,commit,startAssessment,answerAssessment,commitAssessment,restore,chapterProgress,statsSummary} from '../engine.js';
import {chapters,byId,words,coreQuests} from '../curriculum.js';
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
const runs=[];
for(let branch=0;branch<2;branch++){
 let state={...initial(),role:'ren'},answers=0,checks=0;
 for(const [index,chapter] of chapters.entries()){
  state=choose(state,chapter.id,chapter.choices[branch].id);
  while(!chapterProgress(state).readyForAssessment){const session=start(state,{listening:true});while(session.queue.length){const q=session.queue[0],word=byId.get(q.id);answer(session,q.mode==='reading'?word.kana:word.meaning);answers++;}state=commit(state,session);}
  if(branch===0&&(index===0||index===24))await writeFile(new URL(`../artifacts/${index===0?'first-chapter-ready':'before-last-quiz'}.json`,import.meta.url),JSON.stringify(state));
  const assessment=startAssessment(state);while(assessment.queue.length){answerAssessment(assessment,assessment.queue[0].answer);checks++;}
  state=restore(JSON.stringify(commitAssessment(state,assessment)),{strict:true});
 }
 runs.push({branch,completedWords:state.completed.length,coreQuests:coreQuests.length,chapters:chapters.length,cleared:statsSummary(state).chaptersCleared,choices:Object.keys(state.choices).length,answers,checks});
}
const report={date:new Date().toISOString(),availableWords:words.length,runs,kind:'automated-engine-simulation',humanLearningEvidence:false};
await writeFile(new URL('../docs/journey-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
