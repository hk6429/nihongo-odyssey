import {createAuthController,OWNER_KEY} from './cloud-state.js';
let controller=null,config=null,loading=false,hooks=null;
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});
 const data=await response.json();if(!response.ok){const error=Error(data.error);error.status=response.status;error.data=data;throw error;}return data;
}
function render({user=null,status='local',transitioning=false}={}){
 const label={local:'訪客進度保存在本機',saved:'進度已同步',saving:'正在同步進度…',error:'同步未完成，本機紀錄保留'}[status];
 $('#cloud-account').innerHTML=`${user?`<span>${escape(user.name)}</span>`:''}<small role="status">${transitioning?'正在載入帳號…':label}</small><button type="button" id="cloud-login" ${transitioning?'disabled':''}>${user?'登出':'Google 登入'}</button>${status==='error'?'<button type="button" id="cloud-retry">重試同步</button>':''}`;
 $('#cloud-login').onclick=user?async()=>{try{await controller.logout();}catch{hooks.notify('登出未完成，請稍後再試。');}}:openLogin;
 if($('#cloud-retry'))$('#cloud-retry').onclick=async()=>{try{await controller.restoreSession();await controller.flush();}catch{hooks.notify('連線尚未恢復，本機進度仍保留。');}};
}
async function openLogin(){
 let dialog=$('#cloud-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='cloud-dialog';document.body.append(dialog);}
 dialog.innerHTML='<button class="cloud-close" aria-label="關閉登入">×</button><h2>把旅程帶到另一台裝置</h2><p>使用 Google 登入後，本站會保存你的學習進度、故事選擇與複習紀錄。同一帳號可在不同裝置接續。</p><p>第一次登入會合併這個瀏覽器的訪客進度；登出後回到獨立的訪客旅程。</p><div id="cloud-google-button"></div><p id="cloud-message" role="status"></p>';
 dialog.querySelector('.cloud-close').onclick=()=>dialog.close();dialog.showModal();
 try{
  config=await request('/api/config');if(!config.configured)throw Error();
  if(!window.google?.accounts?.id)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=resolve;s.onerror=reject;document.head.append(s);});
  window.google.accounts.id.initialize({client_id:config.googleClientId,auto_select:false,callback:async response=>{try{if(await controller.signIn(response.credential))dialog.close();}catch{$('#cloud-message').textContent='登入未完成，原有進度已保留，請稍後重試。';}}});
  window.google.accounts.id.renderButton($('#cloud-google-button'),{theme:'outline',size:'large',type:'standard',text:'signin_with',locale:'zh_TW'});
 }catch{$('#cloud-message').textContent='登入服務暫時無法連線；可以繼續訪客旅程，稍後再登入同步。';}
}
export function cloudReady(){return !loading&&(!controller||controller.canUseLocalSnapshot());}
export function saveCloud(snapshot){try{controller?.queue(snapshot);}catch{hooks?.notify('雲端備份暫時失敗，請先匯出本機備份。');}}
export async function initCloud(options){
 hooks=options;const host=document.createElement('div');host.id='cloud-account';host.setAttribute('aria-label','Google 帳號與進度同步');document.body.append(host);render();
 if(new URLSearchParams(location.search).has('test')){host.hidden=true;return;}
 if(!hooks.canLoad()){host.innerHTML='<small>請先修復或匯出本機存檔，再重新整理以啟用登入。</small>';return;}
 loading=true;
 for(const event of ['click','change','submit'])document.addEventListener(event,e=>{if(e.target.closest('#cloud-account,#cloud-dialog'))return;if(!cloudReady()){e.preventDefault();e.stopImmediatePropagation();hooks.notify('帳號正在切換，請稍候再操作。');}},true);
 try{
  controller=createAuthController({storage:localStorage,request,getSnapshot:hooks.getSnapshot,applySnapshot:hooks.applySnapshot,onChange:render});
  await controller.restoreSession();
 }catch{render({status:'error'});}finally{loading=false;}
 window.addEventListener('storage',e=>{if(e.key===OWNER_KEY)controller?.canUseLocalSnapshot();});
 window.addEventListener('online',()=>{void controller?.restoreSession().then(()=>controller.flush()).catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void controller?.flush();});
}

export const cloudGeneration=()=>controller?.generation()??0;
