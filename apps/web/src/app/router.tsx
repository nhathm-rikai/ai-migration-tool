import {
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from 'react';

// URL routing of the app shell on the History API (no router dependency).
// Every page is addressable and survives reload; reading a URL never starts
// anything, it only selects what to show.

export const STEP_IDS = [
  'source',
  'analysis',
  'documents',
  'review',
  'quote',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export type Route =
  | { name: 'projects' }
  | {
      name: 'step';
      projectId: string;
      step: StepId;
      // Analysis of one exact run; null = the latest run with an inventory.
      runId: string | null;
    }
  | { name: 'not-found' };

export function isStepId(value: string): value is StepId {
  return (STEP_IDS as readonly string[]).includes(value);
}

function decodeSegment(segment: string): string | null {
  try {
    const value = decodeURIComponent(segment);
    return value === '' ? null : value;
  } catch {
    return null;
  }
}

// `redirect` is the canonical path when it differs from the one given.
export function parseRoute(pathname: string): {
  route: Route;
  redirect: string | null;
} {
  const segments = pathname.split('/').filter((segment) => segment !== '');
  if (segments.length === 0)
    return { route: { name: 'projects' }, redirect: '/projects' };
  if (segments[0] !== 'projects')
    return { route: { name: 'not-found' }, redirect: null };
  if (segments.length === 1)
    return {
      route: { name: 'projects' },
      redirect: pathname === '/projects' ? null : '/projects',
    };
  const projectId = decodeSegment(segments[1] ?? '');
  if (projectId === null)
    return { route: { name: 'not-found' }, redirect: null };
  if (segments.length === 2) {
    const route: Route = {
      name: 'step',
      projectId,
      step: 'source',
      runId: null,
    };
    return { route, redirect: routePath(route) };
  }
  const step = segments[2] ?? '';
  if (!isStepId(step)) return { route: { name: 'not-found' }, redirect: null };
  if (segments.length === 3) {
    const route: Route = { name: 'step', projectId, step, runId: null };
    const canonical = routePath(route);
    return { route, redirect: pathname === canonical ? null : canonical };
  }
  if (segments.length === 4 && step === 'analysis') {
    const runId = decodeSegment(segments[3] ?? '');
    if (runId === null) return { route: { name: 'not-found' }, redirect: null };
    const route: Route = { name: 'step', projectId, step, runId };
    const canonical = routePath(route);
    return { route, redirect: pathname === canonical ? null : canonical };
  }
  return { route: { name: 'not-found' }, redirect: null };
}

export function routePath(route: Route): string {
  if (route.name === 'projects') return '/projects';
  if (route.name === 'not-found') return '/not-found';
  const base = `/projects/${encodeURIComponent(route.projectId)}/${route.step}`;
  return route.runId === null
    ? base
    : `${base}/${encodeURIComponent(route.runId)}`;
}

export function stepPath(
  projectId: string,
  step: StepId,
  runId: string | null = null,
): string {
  return routePath({ name: 'step', projectId, step, runId });
}

// pushState fires no event; the shell listens to this one and to popstate.
const NAVIGATE_EVENT = 'portal:navigate';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

const readPath = () => window.location.pathname;
const readSearch = () => window.location.search;

export function usePathname(): string {
  return useSyncExternalStore(subscribe, readPath);
}

// One query parameter of the current URL (e.g. the program a step works
// on); null when absent. Re-read on every navigation like the pathname.
export function useQueryParam(name: string): string | null {
  const search = useSyncExternalStore(subscribe, readSearch);
  return new URLSearchParams(search).get(name);
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
  if (path === window.location.pathname + window.location.search) return;
  if (options.replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

// A real link (open in new tab, copy address) that navigates in place on a
// plain left click.
export function Link({
  to,
  onClick,
  ...props
}: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <a
      {...props}
      href={to}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target
        )
          return;
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}
