let sequence=0;
export const japaneseVoice=()=>{const voices=globalThis.speechSynthesis?.getVoices().filter(v=>v.lang.toLowerCase().startsWith('ja'))??[];return voices.find(v=>/Kyoko|Otoya|Nanami|Keita|Google.*日本語/i.test(v.name))??voices[0];};
export const stopVoice=()=>{sequence++;globalThis.speechSynthesis?.cancel();};
export function speak(text,{slow=false,notify=()=>{}}={}){
 const voice=japaneseVoice();if(!voice){notify('裝置尚未提供日語聲線。可以先用文字模式練習，或在系統安裝日語聲音。');return false;}
 stopVoice();const token=sequence;const chunks=String(text).replace(/[〜～~]/g,'').match(/[^。！？\n]+[。！？]?/g)||[];let index=0;
 const next=()=>{if(token!==sequence||index>=chunks.length)return;const u=new SpeechSynthesisUtterance(chunks[index++]);u.voice=voice;u.lang='ja-JP';u.rate=slow?.65:.9;u.onend=next;u.onerror=e=>{if(token===sequence&&!['canceled','interrupted'].includes(e.error))notify('朗讀暫時中斷，請重新播放。');};speechSynthesis.speak(u);};next();return true;
}
