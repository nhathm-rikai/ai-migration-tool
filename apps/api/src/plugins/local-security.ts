import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { LOCAL_CREDENTIAL_SCHEME } from '@portal/contracts';
import type { AppConfig } from '../config.js';
import { AppError, type AppErrorCode } from '../shared/app-error.js';

// Access level of a route, set in route `config.access`; routes without it
// are protected. `public` still checks Host and a present Origin.
export type RouteAccess = 'public' | 'bootstrap' | 'protected';

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: RouteAccess;
  }
}

export type LocalSecurityPolicy = {
  allowedHosts: ReadonlySet<string>;
  trustedOrigins: ReadonlySet<string>;
  credential: string;
};

export function createLocalCredential(): string {
  return randomBytes(32).toString('base64url');
}

const LOOPBACK_NAMES = ['127.0.0.1', 'localhost'] as const;
const HTTP_DEFAULT_PORT = 80;

// Only loopback names on the API port and the configured UI ports. The Vite
// proxy forwards the browser's Host, so the UI ports are allowed hosts too.
// Browsers omit the default port 80 from Host and Origin (URL serialization),
// so port 80 is trusted in that form; an explicit `:80` Host stays allowed for
// non-browser clients, but an Origin with `:80` is never sent by a browser.
export function createLocalSecurityPolicy(
  config: Pick<AppConfig, 'port' | 'webPorts'>,
  credential: string,
): LocalSecurityPolicy {
  const allowedHosts = new Set<string>();
  const trustedOrigins = new Set<string>();
  for (const port of [config.port, ...config.webPorts]) {
    for (const name of LOOPBACK_NAMES) {
      const authority = port === HTTP_DEFAULT_PORT ? name : `${name}:${port}`;
      allowedHosts.add(authority);
      allowedHosts.add(`${name}:${port}`);
      trustedOrigins.add(`http://${authority}`);
    }
  }
  return { allowedHosts, trustedOrigins, credential };
}

function hasCredential(request: FastifyRequest, expected: string): boolean {
  const header = request.headers.authorization;
  const prefix = `${LOCAL_CREDENTIAL_SCHEME} `;
  if (header === undefined || !header.startsWith(prefix)) return false;
  const actual = Buffer.from(header.slice(prefix.length));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

// Runs onRequest, before body parsing and every handler, so a rejected
// request never reaches a service or the database.
//
// Policy: Host must be an allowed loopback host. A present Origin must be
// trusted, whatever the route. A missing Origin is not trusted: the bootstrap
// requires one (browsers always send it on POST), and protected routes then
// depend on the credential alone, so non-browser local clients need the token.
export function registerLocalSecurity(
  app: FastifyInstance,
  policy: LocalSecurityPolicy,
): void {
  app.addHook('onRequest', (request, _reply, done) => {
    const failure = rejectionOf(request, policy);
    if (failure) done(new AppError(failure));
    else done();
  });
}

function rejectionOf(
  request: FastifyRequest,
  policy: LocalSecurityPolicy,
): AppErrorCode | undefined {
  const host = request.headers.host?.toLowerCase();
  if (host === undefined || !policy.allowedHosts.has(host))
    return 'HOST_NOT_ALLOWED';
  const origin = request.headers.origin;
  if (origin !== undefined && !policy.trustedOrigins.has(origin))
    return 'ORIGIN_NOT_ALLOWED';
  const access = request.routeOptions.config.access ?? 'protected';
  if (access === 'public') return undefined;
  if (access === 'bootstrap')
    return origin === undefined ? 'ORIGIN_NOT_ALLOWED' : undefined;
  return hasCredential(request, policy.credential)
    ? undefined
    : 'CREDENTIAL_INVALID';
}
