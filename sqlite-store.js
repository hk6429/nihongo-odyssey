// Adapt the shared SQL contract to a Durable Object's synchronous SQLite API.
export function createSqliteStore(storage) {
  function prepare(query) {
    let args = [];
    const execute = () => {
      const cursor = storage.sql.exec(query, ...args);
      const results = cursor.toArray();
      return { results, success: true, meta: { changes: cursor.rowsWritten ?? 0 } };
    };
    return {
      bind(...values) { args = values; return this; },
      async first() { return execute().results[0] ?? null; },
      async run() { return execute(); },
      execute,
    };
  }
  return {
    prepare,
    async batch(statements) {
      return storage.transactionSync(() => statements.map(statement => statement.execute()));
    },
  };
}
