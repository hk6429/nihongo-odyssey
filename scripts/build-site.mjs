import {copyFile, mkdir, rm, writeFile} from 'node:fs/promises';

import {episodes} from '../story.js';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const files = [
  ...episodes.map(e=>`assets/scenes/${e.id}.webp`),
  'cloud-auth.js','cloud-state.js','cloud-model.js','cloud-auth.css','index.html', 'style.css','immersive.css', 'app.js', 'choice-keyboard.js', 'engine.js', 'curriculum.js',
  'story.js', 'lessons.js', 'kana.js', 'legacy-data.js', 'voice.js', 'question-helpers.js',
  'data/vocabulary.json', 'data/vocabulary-overrides.json', 'assets/hero-ink.png',
  'assets/travelers-ink.png', 'assets/realms-ink.png',
  'THIRD-PARTY-NOTICES.md', 'sources/README.md',
  'sources/anki-jlpt-decks/LICENSE', 'sources/anki-jlpt-decks/README.md',
  'docs/vocabulary-audit.json',
];

await rm(output, {recursive: true, force: true});
for (const file of files) {
  const target = new URL(file, output);
  await mkdir(new URL('.', target), {recursive: true});
  await copyFile(new URL(file, root), target);
}
await writeFile(new URL('_headers', output), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Cache-Control: no-cache
`);
console.log(`已建立 dist：${files.length} 個公開檔案與 HTTP 標頭設定。`);
