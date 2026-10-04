import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createWorker,createGoogleVerifier} from '../worker.mjs';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {STORE_SCHEMA} from '../store-schema.js';
import {blankSnapshot,cleanSnapshot,mergeSnapshots,learnedCount} from '../cloud-model.js';
import {createAuthController,OWNER_KEY,backupKey} from '../cloud-state.js';
const origin='https://journey.example.com';
// Exercise real SQLite constraints and RETURNING/CAS SQL behind the D1 interface.
class D1Database {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.sqlite.exec(STORE_SCHEMA); }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql);
    let args = [];
    const wrapper = {
      bind(...values) { args = values.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value); return wrapper; },
      async first() { return statement.get(...args) ?? null; },
      async run() { const result = statement.run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
    return wrapper;
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
async function fixture(run, { configured = true, verifyToken, now } = {}) {
  const db = new D1Database();
  const api = createWorker({ now, verifyToken: verifyToken ?? (async token => {
    if (!['alice', 'bob'].includes(token)) throw Error('invalid');
    return { sub: token, name: token, email: `${token}@example.com`, email_verified: true };
  }) });
  const env = { DB: db, GOOGLE_CLIENT_ID: configured ? 'test-client' : '', APP_ORIGIN: origin };
  const request = async (path, { method = 'GET', cookie, body, raw, requestOrigin = origin, contentType = 'application/json' } = {}) => {
    const response = await api.fetch(new Request(origin + path, {
      method, headers: { Origin: requestOrigin, 'Content-Type': contentType, ...(cookie ? { Cookie: cookie } : {}) },
      ...(body !== undefined || raw !== undefined ? { body: raw ?? JSON.stringify(body) } : {}),
    }), env);
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers, cookie: response.headers.get('Set-Cookie')?.split(';')[0] };
  };
  try { await run({ request, db, env }); } finally { db.sqlite.close(); }
}

const login=(r,credential='alice')=>r('/api/auth/google',{method:'POST',body:{credential}});
const save=(r,account,revision,snapshot=blankSnapshot(),expectedAccountId='alice')=>r('/api/progress',{method:'PUT',cookie:account.cookie,body:{revision,snapshot,expectedAccountId}});
test('API: unauthenticated writes, CSRF, forged credentials and invalid state rejected',()=>fixture(async({request:r})=>{
 assert.equal((await r('/api/session')).data.user,null);
 assert.equal((await save(r,{},0)).status,401);
 assert.equal((await r('/api/auth/google',{method:'POST',requestOrigin:'https://evil.example',body:{credential:'alice'}})).status,403);
 assert.equal((await login(r,'forged')).status,401);
 const a=await login(r);assert.match(a.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 assert.equal((await save(r,a,0,{})).status,400);
 assert.equal((await save(r,a,0,blankSnapshot(),'bob')).data.error,'account_changed');
}));
test('API: account-specific save, reread, revision conflict, regression and logout',()=>fixture(async({request:r})=>{
 const a=await login(r),b=await login(r,'bob'),s=earned();
 assert.equal((await save(r,a,0,s)).status,200);
 assert.deepEqual((await r('/api/progress',{cookie:a.cookie})).data.snapshot,cleanSnapshot(s));
 assert.equal((await r('/api/progress',{cookie:b.cookie})).data.snapshot,null);
 assert.equal((await save(r,a,0,s)).status,409);
 assert.equal((await save(r,a,1)).data.error,'newer_progress_exists');
 assert.equal((await r('/api/logout',{method:'POST',cookie:a.cookie,body:{expectedAccountId:'bob'}})).status,409);
 assert.equal((await r('/api/logout',{method:'POST',cookie:a.cookie,body:{expectedAccountId:'alice'}})).status,200);
 assert.equal((await r('/api/session',{cookie:a.cookie})).data.user,null);
 assert.equal(learnedCount((await login(r)).data.snapshot),learnedCount(s));
}));
test('Google token verification checks signature, audience, expiry and verified identity',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');const key=await exportJWK(publicKey);key.kid='test';
 const verify=createGoogleVerifier(createLocalJWKSet({keys:[key]}));
 const token=async(aud,exp='1h',email_verified=true)=>new SignJWT({sub:'alice',email_verified}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://accounts.google.com').setAudience(aud).setExpirationTime(exp).sign(privateKey);
 assert.equal((await verify(await token('client'),'client')).sub,'alice');
 await assert.rejects(()=>verify(token,'client'));
 await assert.rejects(async()=>verify(await token('other'),'client'));
 await assert.rejects(async()=>verify(await token('client','-1h'),'client'));
 await assert.rejects(async()=>verify(await token('client','1h',false),'client'));
});
test('merge keeps earned progress with a newer empty-device profile and is idempotent',()=>{
 const s=earned(),m=mergeSnapshots(s,blankSnapshot());assert.equal(learnedCount(m),learnedCount(s));
 assert.deepEqual(mergeSnapshots(m,m),m);assert.equal(learnedCount(mergeSnapshots(blankSnapshot(),s)),learnedCount(s));
});
function harness(snapshot=blankSnapshot(),requestOverride){
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 let state=structuredClone(snapshot),account=null,revision=0,cloud=null;
 const request=requestOverride|| (async(path,options)=>{
  const body=JSON.parse(options?.body||'{}');
  if(path==='/api/auth/google'){account={id:body.credential,name:body.credential};return {user:account,snapshot:null,revision:0};}
  if(path==='/api/session')return {user:account,snapshot:cloud,revision};
  if(path==='/api/logout'){account=null;return {ok:true};}
  cloud=body.snapshot;revision++;return {revision};
 });
 const c=createAuthController({storage,request,getSnapshot:()=>state,applySnapshot:async s=>{state=structuredClone(s);},schedule:()=>0,cancel:()=>{}});
 return {c,values,storage,get snapshot(){return state},get cloud(){return cloud},set snapshot(s){state=s}};
}
test('guest merge is consumed once; account B never receives account A progress',async()=>{
 const h=harness(earned());await h.c.restoreSession();await h.c.signIn('alice');await h.c.flush();
 assert.equal(learnedCount(h.snapshot),learnedCount(earned()));assert.equal(h.c.getState().status,'saved');
 await h.c.logout();assert.equal(learnedCount(h.snapshot),0);
 await h.c.signIn('bob');assert.equal(learnedCount(h.snapshot),0);
 await h.c.logout();await h.c.signIn('alice');assert.equal(learnedCount(h.snapshot),learnedCount(earned()));
});
test('offline failure keeps pending snapshot and retry saves it',async()=>{
 let fail=true;const h=harness(earned(),async(path,options)=>{
  if(path==='/api/auth/google')return {user:{id:'alice'},snapshot:null,revision:0};
  if(fail)throw Error('offline');return {revision:1};
 });
 await h.c.signIn('alice');await h.c.flush();assert.equal(h.c.getState().status,'error');assert.ok(h.c.getState().pending);
 fail=false;await h.c.flush();assert.equal(h.c.getState().status,'saved');
});
test('a stale tab cannot enqueue progress after another account owns storage',async()=>{
 const h=harness();await h.c.signIn('alice');h.storage.setItem(OWNER_KEY,JSON.stringify({owner:'bob'}));
 assert.equal(h.c.canUseLocalSnapshot(),false);h.c.queue(earned());
 assert.equal(h.storage.getItem(backupKey('bob')),null);
});
import {initial,choose,start,answer,commit} from '../engine.js';
import {chapters,byId} from '../curriculum.js';
function earned(){let s=choose({...initial(),role:'sora'},chapters[0].id,chapters[0].choices[0].id);const run=start(s);while(run.queue.length){const q=run.queue[0],w=byId.get(q.id);answer(run,q.mode==='reading'?w.kana:w.meaning);}return commit(s,run);}
