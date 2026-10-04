import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {episodes} from '../story.js';

test('所有 25 小關都有獨立且可發布的 WebP 情境插畫',()=>{
 assert.equal(episodes.length,25);
 const hashes=new Set();
 for(const e of episodes){
  const bytes=readFileSync(new URL(`../assets/scenes/${e.id}.webp`,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF',e.id);
  assert.equal(bytes.toString('ascii',8,12),'WEBP',e.id);
  assert.ok(bytes.length>10000&&bytes.length<1500000,`${e.id}: ${bytes.length} bytes`);
  hashes.add(createHash('sha256').update(bytes).digest('hex'));
 }
 assert.equal(hashes.size,25,'不可以用重複圖片充作不同情境');
});
