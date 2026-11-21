import React, { useState, useEffect } from 'react';
import { SignalsView } from './components/SignalsView';

export default function App() {
  const [theme] = useState<'dark' | 'light'>(() => {
    try {
      const urlTheme = new URLSearchParams(window.location.search).get('theme');
      if (urlTheme === 'dark' || urlTheme === 'light') {
        return urlTheme;
      }
      return 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tickedge_theme', theme);
    } catch {}
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  return (
    <div
      className={`min-h-screen flex flex-col selection:bg-[#00e599]/30 ${
        theme === 'light'
          ? 'bg-slate-50 text-slate-900'
          : 'bg-[#080d16] text-slate-100'
      }`}
    >
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-4 sm:py-5 flex flex-col gap-4 pb-8">
        <SignalsView theme={theme} />
      </main>
    </div>
  );
}
