export const choiceHint = '鍵盤：A ←／1　B ↑／2　C ↓／3　D →／4';
export function choiceIndex(event) {
 if(event.defaultPrevented || event.isComposing || event.keyCode===229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return -1;
 if(event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]'))return -1;
 return ({ArrowLeft:0,ArrowUp:1,ArrowDown:2,ArrowRight:3,'1':0,'2':1,'3':2,'4':3})[event.key] ?? -1;
}
export function installChoiceKeyboard(doc) {
 doc.addEventListener('keydown',event=>{
  const index=choiceIndex(event);if(index<0)return;
  const dialogs=[...doc.querySelectorAll('dialog[open]')],scope=dialogs.at(-1)||doc;
  const groups=[...scope.querySelectorAll('[data-quiz-options]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));
  const focused=event.target?.closest?.('[data-quiz-options]');
  const group=groups.includes(focused)?focused:groups[0];if(!group)return;
  // Keep the original option positions, including disabled options.
  const button=group.querySelectorAll('button[data-quiz-choice]')[index];if(!button)return;
  event.preventDefault();
  if(event.repeat||button.disabled||button.closest('[hidden]'))return;
  button.click();
 });
 // A double click belongs to one answer even when the next question appears immediately.
 doc.addEventListener('click',event=>{
  if(event.detail>1&&event.target?.closest?.('[data-quiz-choice]')){event.preventDefault();event.stopImmediatePropagation();}
 },true);
}
