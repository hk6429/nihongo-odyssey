import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Pure merge with an explicit allowlist. IDs, reading, and provenance cannot be changed.
export function applyVocabularyOverrides(vocabulary, layer) {
  if (layer.schemaVersion !== 1 || !layer.entries) throw new Error('不支援的補充層格式');
  const ids = new Set(vocabulary.map(word => word.id));
  const allowed = new Set(['example', 'translation', 'meaning', 'usageNote', 'exampleSource', 'reference']);
  for (const [id, changes] of Object.entries(layer.entries)) {
    if (!ids.has(id)) throw new Error(`補充層引用不存在的詞：${id}`);
    if (Object.keys(changes).some(key => !allowed.has(key))) throw new Error(`補充層不得修改識別或來源欄位：${id}`);
    if (!changes.example?.endsWith('。') || !changes.translation) throw new Error(`補充例句不完整：${id}`);
  }
  return vocabulary.map(word => ({...word, ...(layer.entries[word.id] ?? {})}));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('用法：node scripts/apply-vocabulary-overrides.mjs [--check | --output <新檔路徑>]\n預設只驗證補充層；--output 寫出套用後的教材，不得覆寫原詞庫或原CSV。');
  } else {
    if (args.length && !(args.length === 1 && args[0] === '--check') && !(args.length === 2 && args[0] === '--output')) throw new Error('不支援的參數；請用 --help');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const original = resolve(root, 'data/vocabulary.json');
    const vocabulary = JSON.parse(await readFile(original, 'utf8'));
    const layer = JSON.parse(await readFile(resolve(root, 'data/vocabulary-overrides.json'), 'utf8'));
    const effective = applyVocabularyOverrides(vocabulary, layer);
    if (effective.length !== 10629 || new Set(effective.map(word => word.id)).size !== 10629) throw new Error('唯一詞數改變');
    if (effective.some(word => !word.example || !word.translation)) throw new Error('仍有缺例句或翻譯');
    if (args[0] === '--output') {
      const target = resolve(args[1]);
      if (target === original || target.startsWith(resolve(root, 'sources') + '/') || !target.endsWith('.json')) throw new Error('輸出限新增 JSON，不得修改原資料');
      // wx rejects accidental overwrites of any existing file.
      await writeFile(target, JSON.stringify(effective, null, 2) + '\n', {flag: 'wx'});
    }
    console.log(JSON.stringify({uniqueWords: effective.length, originalMissing: vocabulary.filter(word => !word.example).length, suppliedExamples: layer.metadata.missingExamplesSupplied, overrideEntries: Object.keys(layer.entries).length, effectiveMissing: 0}));
  }
}
