'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type StudyTab =
  | 'studies'
  | 'chat'
  | 'network'
  | 'materials'
  | 'courses'
  | 'library'
  | 'plan'
  | 'settings';
export type StudyPractice = { stageId: string; title: string };
type Screen = { tab: StudyTab; reading: string; course: string; practice: StudyPractice | null };
type Entry = { session: string; index: number; screen: Screen };
const tabs: StudyTab[] = [
  'studies',
  'chat',
  'network',
  'materials',
  'courses',
  'library',
  'plan',
  'settings',
];
const initial: Screen = { tab: 'studies', reading: '', course: '', practice: null };
const key = 'guriaStudyNavigation';
const storageKey = (session: string) => `guria-navigation:${session}`;

function validEntry(value: any): value is Entry {
  return (
    typeof value?.session === 'string' &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    tabs.includes(value.screen?.tab) &&
    typeof value.screen.reading === 'string' &&
    typeof value.screen.course === 'string' &&
    (value.screen.practice === null ||
      (typeof value.screen.practice?.stageId === 'string' &&
        typeof value.screen.practice?.title === 'string'))
  );
}

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
      const saved = window.history.state?.[key];
      let entry: Entry;
      if (validEntry(saved)) {
        entry = saved;
      } else {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab') as StudyTab;
        entry = {
          session: crypto.randomUUID(),
          index: 0,
          screen: {
            ...initial,
            tab: tabs.includes(tab) ? tab : 'studies',
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
