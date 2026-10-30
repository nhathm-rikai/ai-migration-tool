import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Pieces shared by the project graph (UI03) and the procedure graph (UI04):
// the full-screen host and its modal focus, and the square toolbar button.

// The graph is rendered into one element that stays in the page, or moves
// to <body> for full screen (a fixed overlay inside the page would be
// clipped by the panels around it). Moving the element, not the React
// tree, keeps the canvas and its layout mounted.
export function useFloatingHost(floating: boolean) {
  const slot = useRef<HTMLDivElement>(null);
  const [host] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    const parent = floating ? document.body : slot.current;
    parent?.appendChild(host);
  }, [floating, host]);
  useLayoutEffect(() => () => host.remove(), [host]);
  return { slot, host };
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// A full-screen graph is a modal dialog: focus moves into it, Tab and
// Shift+Tab stay inside, the page behind is inert (no clicks, no focus, not
// read out), and focus returns to where it was when it closes. Call it
// before useFloatingHost, whose move of the host drops the focus.
export function useModalFocus(
  active: boolean,
  dialog: { readonly current: HTMLElement | null },
) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (active)
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
  }, [active]);
  useEffect(() => {
    const element = dialog.current;
    if (!active || !element) return;
    const back = opener.current;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const focusables = () =>
      // Elements in a hidden panel cannot take focus.
      [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => !item.closest('[hidden]'),
      );
    (focusables()[0] ?? element).focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const current = document.activeElement;
      const outside = !(current instanceof Node) || !element.contains(current);
      if (event.shiftKey && (current === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      root?.removeAttribute('inert');
      if (back?.isConnected) back.focus();
    };
  }, [active, dialog]);
}

// Icon paths of the toolbar buttons.
export const ICON = {
  expandAll: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 12h6M12 9v6',
  collapseAll: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5M9 12h6',
  fullScreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  exitFullScreen: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
};

// A square toolbar button: an icon, its name as label and tooltip.
export function IconButton({
  label,
  path,
  pressed,
  onClick,
}: {
  label: string;
  path: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="dep-icon-button"
      aria-label={label}
      title={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );
}
