import { createClient } from '@libsql/client/web';
import type { Client } from '@libsql/client';
import { createApp } from './app';

interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN?: string;
  DEFAULT_TENANT_ID: string;
  ASSETS: Fetcher;
}

let client: Client | undefined;

const app = createApp({
  db: (env) => {
    // One HTTP client per isolate; it holds no open connection, so reuse is safe.
    client ??= createClient({
      url: String(env.TURSO_DATABASE_URL),
      authToken: env.TURSO_AUTH_TOKEN ? String(env.TURSO_AUTH_TOKEN) : undefined,
    }) as unknown as Client;
    return client;
  },
  tenantId: (env) => String(env.DEFAULT_TENANT_ID),
});

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
