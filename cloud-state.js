import {blankSnapshot,cleanSnapshot,mergeSnapshots} from './cloud-model.js';
export const OWNER_KEY='nihongo-odyssey-local-owner-v1';
export const backupKey=owner=>`nihongo-odyssey-account-backup-v1:${encodeURIComponent(owner)}`;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** Account-scoped local backups and request generations prevent cross-account writes. */
export function createAuthController({storage,request,getSnapshot,applySnapshot,onChange=()=>{},schedule=setTimeout,cancel=clearTimeout}){
 let user=null,revision=0,status='local',pending=null,epoch=0,flight=null,timer=null,transitioning=false,applyTail=Promise.resolve(),authTail=Promise.resolve(),refresh=null,sessionOwner=null;
 const metadata=()=>JSON.parse(storage.getItem(OWNER_KEY)||'{"owner":"guest","pending":false}');
 // Shared storage can change before this tab receives a storage event. Its in-memory
 // snapshot must keep the owner it had when loaded, never the latest shared owner.
 let localOwner=metadata().owner,localDirty=Boolean(metadata().pending);
 const saved=owner=>JSON.parse(storage.getItem(backupKey(owner))||'null');
 const backup=(owner,snapshot,dirty)=>storage.setItem(backupKey(owner),JSON.stringify({snapshot:cleanSnapshot(snapshot),pending:Boolean(dirty)}));
 const activate=(owner,snapshot,dirty)=>{localOwner=owner;localDirty=Boolean(dirty);backup(owner,snapshot,dirty);storage.setItem(OWNER_KEY,JSON.stringify({owner,pending:Boolean(dirty)}));};
 const emit=()=>onChange({user,status,revision,transitioning});
 const current=token=>token===epoch;
 // Cookie-setting requests must finish in order, even when an older response is ignored.
 const accountRequest=(path,options)=>{const run=authTail.catch(()=>{}).then(()=>request(path,typeof options==='function'?options():options)).then(data=>{if(path==='/api/auth/google')sessionOwner=data.user.id;else if(path==='/api/logout')sessionOwner=null;return data;});authTail=run;return run;};
 const invalidate=()=>{epoch++;cancel(timer);timer=null;flight=null;pending=null;return epoch;};
 const apply=(snapshot,token,before=()=>{})=>{
  const run=applyTail.catch(()=>{}).then(async()=>{if(!current(token))return false;before();await applySnapshot(snapshot);return current(token);});
  applyTail=run;return run;
 };
 const later=()=>{cancel(timer);timer=schedule(()=>{void flush();},350);};
 function preserveCurrent(){const meta={owner:localOwner,pending:localDirty||Boolean(pending)};backup(meta.owner,getSnapshot(),meta.pending);return meta;}
 async function useGuest(token){
  const meta=preserveCurrent();
  const guest=meta.owner==='guest'?cleanSnapshot(getSnapshot()):(saved('guest')?.snapshot||blankSnapshot());
  if(!current(token))return;
  if(meta.owner==='guest')activate('guest',guest,false);
  else if(!await apply(guest,token,()=>activate('guest',guest,false)))return;
  if(!current(token))return;
  user=null;sessionOwner=null;revision=0;pending=null;status='local';transitioning=false;emit();
 }
 async function accept(data,token,{restoring=false}={}){
  if(!current(token))return;
  if(!data.user){await useGuest(token);return;}
  // On upgrade, an existing signed-in session owns the previously unbound device data.
  if(restoring&&!storage.getItem(OWNER_KEY))activate(data.user.id,getSnapshot(),false);
  const meta=preserveCurrent(),owner=data.user.id,ownBackup=saved(owner);
  let local,dirty=false;
  if(meta.owner===owner){local=getSnapshot();dirty=Boolean(meta.pending);}
  else if(meta.owner==='guest'){
   local=ownBackup?mergeSnapshots(getSnapshot(),ownBackup.snapshot):getSnapshot();dirty=Boolean(ownBackup?.pending);
  }else{local=ownBackup?.snapshot||blankSnapshot();dirty=Boolean(ownBackup?.pending);}
  const merged=mergeSnapshots(local,data.snapshot,{preferLocalProfile:dirty}),needsSave=!same(merged,data.snapshot);
  if(!await apply(merged,token,()=>activate(owner,merged,needsSave)))return;
  if(meta.owner==='guest')backup('guest',blankSnapshot(),false);
  user=data.user;sessionOwner=user.id;revision=data.revision;pending=needsSave?structuredClone(merged):null;status=needsSave?'saving':'saved';transitioning=false;emit();
  if(pending)later();
 }
 async function restoreSession(){
  const token=invalidate();transitioning=true;emit();
  try{await accept(await request('/api/session'),token,{restoring:true});}
  catch(error){if(current(token)){transitioning=false;status='error';emit();}throw error;}
 }
 function syncAccount(){
  if(refresh)return refresh;
  refresh=restoreSession().finally(()=>{refresh=null;});return refresh;
 }
 function canUseLocalSnapshot({allowTransition=false,rawProgress}={}){
  if(metadata().owner!==localOwner){void syncAccount().catch(()=>{});return false;}
  // Storage events may arrive after a second account switch. The progress key
  // alone has no owner, so only accept values also present in this owner's backup.
  if(rawProgress!==undefined&&!same(cleanSnapshot(rawProgress),saved(localOwner)?.snapshot))return false;
  return allowTransition||!transitioning;
 }
 async function signIn(credential){
  preserveCurrent();const token=invalidate();transitioning=true;emit();
  try{await accept(await accountRequest('/api/auth/google',{method:'POST',body:JSON.stringify({credential})}),token);return current(token);}
  catch(error){if(current(token)){transitioning=false;status='error';emit();}throw error;}
 }
 async function logout(){
  if(metadata().owner!==localOwner){await syncAccount();return;}
  preserveCurrent();const token=invalidate();transitioning=true;emit();
  try{await accountRequest('/api/logout',()=>({method:'POST',body:JSON.stringify({expectedAccountId:sessionOwner})}));if(current(token))await useGuest(token);}
  catch(error){if(current(token)){if(error.data?.error==='account_changed'){await syncAccount();return;}transitioning=false;status='error';emit();}throw error;}
 }
 function queue(snapshot){
  if(!canUseLocalSnapshot())return;
  activate(localOwner,snapshot,Boolean(user)||localOwner!=='guest');
  if(!user)return;
  pending=cleanSnapshot(snapshot);later();
 }
 async function flush(){
  if(!canUseLocalSnapshot())return;
  if(flight||!pending||!user||transitioning)return;
  const token=epoch,owner=user.id;
  if(metadata().owner!==owner)return;
  const sent=pending,job={token,owner};pending=null;flight=job;status='saving';emit();
  const valid=()=>current(token)&&user?.id===owner&&metadata().owner===owner;
  try{
   const data=await request('/api/progress',{method:'PUT',body:JSON.stringify({expectedAccountId:owner,revision,snapshot:sent})});
   if(!valid())return;
   revision=data.revision;status=pending?'saving':'saved';activate(owner,pending||sent,Boolean(pending));
  }catch(error){
   if(!valid())return;
   if(error.data?.error==='account_changed'){await syncAccount();return;}
   if(error.status===409&&error.data?.snapshot){
    revision=error.data.revision;
    const merged=mergeSnapshots(pending||sent,error.data.snapshot,{preferLocalProfile:true});
    if(!await apply(merged,token)||!valid())return;
    pending=merged;activate(owner,merged,true);status='saving';
   }else{
    status='error';if(!pending)pending=sent;
    if(error.status===401){preserveCurrent();const next=invalidate();transitioning=true;emit();await useGuest(next);}
   }
  }finally{if(flight===job){flight=null;emit();if(pending&&status!=='error')later();}}
 }
 return {generation:()=>epoch,restoreSession,syncAccount,canUseLocalSnapshot,signIn,logout,queue,flush,getState:()=>({user,status,revision,pending:structuredClone(pending)})};
}
