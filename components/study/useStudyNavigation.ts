'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  normalizeEntry,
  tabFromQuery,
  type StudyEntry,
  type StudyScreen,
} from '@/lib/study/ui/navigation';

export type { StudyTab } from '@/lib/study/ui/navigation';
type Screen = StudyScreen;
type Entry = StudyEntry;
const initial: Screen = { tab: 'studies', reading: '', course: '' };
const key = 'guriaStudyNavigation';
const storageKey = (session: string) => `guria-navigation:${session}`;

/** Navigation changes only browser history; it never saves the study workspace. */
export function useStudyNavigation() {
  const [screen, setScreen] = useState<Screen>(initial);
  const [bounds, setBounds] = useState({ back: false, forward: false });
  const current = useRef<Entry | null>(null);
  const last = useRef(0);

  const apply = useCallback((entry: Entry) => {
    current.current = entry;
    setScreen(entry.screen);
    setBounds({ back: entry.index > 0, forward: entry.index < last.current });
  }, []);

  useEffect(() => {
    const restore = () => {
      // Entradas antigas (Biblioteca, player de quiz) são convertidas para o Praticar.
      const saved = normalizeEntry(window.history.state?.[key]);
      let entry: Entry;
      if (saved) {
        entry = saved;
        window.history.replaceState({ ...window.history.state, [key]: entry }, '');
      } else {
        const params = new URLSearchParams(window.location.search);
        entry = {
          session: crypto.randomUUID(),
          index: 0,
          screen: {
            ...initial,
            tab: tabFromQuery(params.get('tab')),
            reading: params.get('study') || '',
          },
        };
        window.history.replaceState({ ...window.history.state, [key]: entry }, '');
      }
      last.current =
        current.current?.session === entry.session
          ? Math.max(last.current, entry.index)
          : entry.index;
      try {
        const savedLast = Number(sessionStorage.getItem(storageKey(entry.session)));
        if (Number.isSafeInteger(savedLast)) last.current = Math.max(entry.index, savedLast);
      } catch {}
      apply(entry);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [apply]);

  const navigate = useCallback(
    (patch: Partial<Screen>) => {
      const previous = current.current;
      if (!previous) return;
      const next = { ...previous.screen, ...patch };
      if (JSON.stringify(next) === JSON.stringify(previous.screen)) return;
      const entry = { ...previous, index: previous.index + 1, screen: next };
      const url = new URL(window.location.href);
      if (next.tab === 'studies') url.searchParams.delete('tab');
      else url.searchParams.set('tab', next.tab);
      if (next.reading) url.searchParams.set('study', next.reading);
      else url.searchParams.delete('study');
      window.history.pushState({ ...window.history.state, [key]: entry }, '', url);
      last.current = entry.index; // A new destination discards the old forward branch.
      try {
        sessionStorage.setItem(storageKey(entry.session), String(entry.index));
      } catch {}
      apply(entry);
      window.scrollTo(0, 0);
    },
    [apply],
  );

  return {
    ...screen,
    navigate,
    canGoBack: bounds.back,
    canGoForward: bounds.forward,
    goBack: () => {
      if (bounds.back) window.history.back();
    },
    goForward: () => {
      if (bounds.forward) window.history.forward();
    },
  };
}
