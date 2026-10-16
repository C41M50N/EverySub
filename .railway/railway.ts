import { defineRailway, github, postgres, project, service, volume } from 'railway/iac';

export default defineRailway((ctx) => {
  if (ctx.projectId !== '120b73a9-0f02-4926-9272-1c3699384c9f') {
    throw new Error('Link this repository to the SubTrack Railway project before applying.');
  }
  if (ctx.environment !== 'production' && ctx.environment !== 'development') {
    throw new Error('EverySub infrastructure supports production and development only.');
  }

  const production = ctx.environment === 'production';
  const region = 'us-east4-eqdc4a';
  const database = postgres('Postgres', { region });

  // Preserve the existing development database's public connection for local work.
  database.networking = {
    privateNetworkEndpoint: 'postgres',
    ...(production ? {} : { tcpProxies: { '5432': {} } }),
  };

  if (!production) {
    // Imported separately by Railway; keep it declared to retain the existing data.
    const developmentVolume = volume('postgres-volume', {
      alerts: { usage: { '80': {}, '95': {}, '100': {} } },
      allowOnlineResize: true,
      region,
      sizeMB: 5000,
    });

    return project('SubTrack', { resources: [database, developmentVolume] });
  }

  const env = {
    NODE_ENV: 'production',
    RAILPACK_BUN_VERSION: '1.4.2',
    RAILPACK_NODE_VERSION: '24',
    // Pre-deploy migrations need drizzle-kit in the runtime image.
    RAILPACK_PRUNE_DEPS: 'false',
    DATABASE_URL: database.env.DATABASE_URL,
    BETTER_AUTH_SECRET: ctx.shared.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: 'https://everysub.app',
    GOOGLE_CLIENT_ID: ctx.shared.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: ctx.shared.GOOGLE_CLIENT_SECRET,
    LOGO_DEV_SECRET_KEY: ctx.shared.LOGO_DEV_SECRET_KEY,
    LOGO_DEV_PUBLISHABLE_KEY: ctx.shared.LOGO_DEV_PUBLISHABLE_KEY,
    OPENAI_API_KEY: ctx.shared.OPENAI_API_KEY,
    RESEND_API_KEY: ctx.shared.RESEND_API_KEY,
    RESEND_FROM_ADDRESS: ctx.shared.RESEND_FROM_ADDRESS,
    RESEND_WEBHOOK_SECRET: ctx.shared.RESEND_WEBHOOK_SECRET,
  };
  const source = github('C41M50N/EverySub', { branch: 'main' });
  const build = { builder: 'RAILPACK' as const, buildCommand: 'bun run build' };
  const replicas = { [region]: 1 };

  const web = service('web', {
    source,
    build,
    start: 'bun run start',
    preDeploy: 'bun run db:migrate',
    healthcheck: '/api/health',
    healthcheckTimeout: 120,
    replicas,
    domains: [{ domain: 'everysub.app', port: 8080 }],
    env: { ...env, HOST: '0.0.0.0', PORT: '8080' },
    // Railway stores its default On Failure policy as null.
    deploy: { restartPolicyMaxRetries: 5 },
  });

  const jobs = service('scheduled-jobs', {
    source,
    build,
    start: 'bun run jobs:run',
    replicas,
    env,
    deploy: { cronSchedule: '*/5 * * * *', restartPolicyType: 'NEVER' },
  });

  return project('SubTrack', { resources: [database, web, jobs] });
});
