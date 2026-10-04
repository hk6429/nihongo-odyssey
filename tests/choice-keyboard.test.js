import test from 'node:test';
import assert from 'node:assert/strict';
import {choiceIndex,installChoiceKeyboard} from '../choice-keyboard.js';
test('A/B/C/D map to left/up/down/right and 1/2/3/4',()=>{
 for(const [i,keys] of [['ArrowLeft','1'],['ArrowUp','2'],['ArrowDown','3'],['ArrowRight','4']].entries())for(const key of keys)assert.equal(choiceIndex({key}),i);
 for(const key of ['a','Enter','0','5'])assert.equal(choiceIndex({key}),-1);
});
test('typing, IME, modifier shortcuts and handled events remain untouched',()=>{
 for(const flag of ['isComposing','ctrlKey','altKey','metaKey','shiftKey','defaultPrevented'])assert.equal(choiceIndex({key:'1',[flag]:true}),-1);
 assert.equal(choiceIndex({key:'1',keyCode:229}),-1);
 assert.equal(choiceIndex({key:'ArrowLeft',target:{closest:()=>({})}}),-1);
});
function harness(){
 const listeners={};let calls=[0,0,0,0],prevented=0;
 const buttons=calls.map((_,i)=>({disabled:false,closest:()=>null,click:()=>calls[i]++}));
 const group={getClientRects:()=>[{}],closest:()=>null,querySelectorAll:()=>buttons};
 const doc={querySelectorAll:s=>s==='dialog[open]'?[]:[group],addEventListener:(type,fn)=>listeners[type]=fn};
 installChoiceKeyboard(doc);
 return {buttons,group,doc,calls,listeners,fire:(key,more={})=>listeners.keydown({key,preventDefault:()=>prevented++,...more}),prevented:()=>prevented};
}
test('repeat does not answer the following question and disabled slots never shift',()=>{
 const h=harness();h.fire('1');h.fire('1',{repeat:true});assert.deepEqual(h.calls,[1,0,0,0]);
 h.buttons[0].disabled=true;h.fire('1');h.fire('2');assert.deepEqual(h.calls,[1,1,0,0]);assert.equal(h.prevented(),4);
});
test('hidden quiz and a covering modal cannot receive shortcuts',()=>{
 const h=harness();h.group.getClientRects=()=>[];h.fire('1');assert.equal(h.prevented(),0);
 h.group.getClientRects=()=>[{}];h.doc.querySelectorAll=s=>s==='dialog[open]'?[{querySelectorAll:()=>[]}]:[h.group];h.fire('1');assert.deepEqual(h.calls,[0,0,0,0]);
});
test('double click is stopped before it can answer another question',()=>{
 const h=harness();let stopped=0;
 h.listeners.click({detail:2,target:{closest:()=>({})},preventDefault(){},stopImmediatePropagation:()=>stopped++});assert.equal(stopped,1);
});
