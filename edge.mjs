import { DurableObject } from 'cloudflare:workers';
import { createWorker } from './worker.mjs';
import { createSqliteStore } from './sqlite-store.js';
import { STORE_SCHEMA } from './store-schema.js';

// A dedicated namespace keeps this site's records separate from other projects.
export class ProgressStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.runtimeEnv = env;
    ctx.storage.sql.exec(STORE_SCHEMA);
    this.database = createSqliteStore(ctx.storage);
    this.handler = createWorker();
  }
  fetch(request) {
    return this.handler.fetch(request, { ...this.runtimeEnv, DB: this.database, STORAGE_KIND: 'durable-sqlite' });
  }
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    const id = env.PROGRESS_STORE.idFromName('nihongo-odyssey-v1');
    return env.PROGRESS_STORE.get(id).fetch(request);
  },
};
