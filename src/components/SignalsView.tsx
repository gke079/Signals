import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Market } from '../types';
import {
  BarrierFilter,
  MarketSignalSnapshot,
  MultiMarketSignalScanner,
  SignalCategory,
  OverUnder27Filter,
  OnlyUpDownStrategy,
  formatTradingViewCountdown,
} from '../services/signalScannerEngine';
import { RotateCcw, TrendingUp, Clock, Search, X, Zap } from 'lucide-react';

interface SignalsViewProps {
  theme?: 'dark' | 'light';
}

const ScanningRing: React.FC<{ secondsLeft: number; totalSeconds?: number; size?: number }> = ({
  secondsLeft,
  totalSeconds = 17,
  size = 38,
}) => {
  const total = Math.max(1, totalSeconds);
  const strokeWidth = 3;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0.04, Math.min(1, secondsLeft / total));
  const strokeDashoffset = circumference * (1 - progress);

  const formattedTime =
    secondsLeft >= 60
      ? `${Math.floor(secondsLeft / 60)}:${(secondsLeft % 60).toString().padStart(2, '0')}`
      : `${secondsLeft}s`;

  return (
    <div
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center shrink-0"
    >
      <svg style={{ width: size, height: size }} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
          opacity="1"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#0284c7"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      <span
        className={`absolute font-mono tabular-nums font-bold text-slate-900 ${
          secondsLeft >= 60 ? 'text-[9px] leading-none' : 'text-[11px] leading-none'
        }`}
      >
        {formattedTime}
      </span>
    </div>
  );
};

const MacdMiniHistogram: React.FC<{
  histograms?: (number | null)[];
}> = ({ histograms = [] }) => {
  const valid = histograms.filter((v): v is number => typeof v === 'number');
  const maxAbs = Math.max(0.00001, ...valid.map((v) => Math.abs(v)));

  return (
    <div className="flex items-center gap-1.5 h-6 px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
      <span className="text-[9px] font-mono font-bold text-slate-500 uppercase shrink-0">
        Hist:
      </span>
      <div className="flex items-center justify-between gap-1 flex-1 h-full pt-0.5">
        {histograms.slice(-8).map((h, i, arr) => {
          if (h === null || h === undefined) {
            return (
              <div
                key={i}
                className="flex-1 h-0.5 bg-slate-300 rounded self-center"
              />
            );
          }
          const prev = i > 0 && arr[i - 1] !== null ? (arr[i - 1] as number) : h;
          const isPos = h >= 0;
          const heightPct = Math.min(
            100,
            Math.max(25, Math.round((Math.abs(h) / maxAbs) * 100))
          );

          let barBg = 'bg-slate-400';
          let title = '';
          if (!isPos) {
            if (h <= prev) {
              barBg = 'bg-red-600'; // Long dark red (No Trade)
              title = `Long Dark Red [No Trade] (${h.toFixed(4)})`;
            } else {
              barBg = 'bg-rose-400'; // Faded red (Good Market)
              title = `Faded Red [Good Market] (${h.toFixed(4)})`;
            }
          } else {
            if (h < prev) {
              barBg = 'bg-amber-400'; // Faded green (No Trade)
              title = `Faded Green [No Trade] (${h.toFixed(4)})`;
            } else {
              barBg = 'bg-emerald-600'; // Short/Long dark green
              title = `Dark Green [Good Market] (${h.toFixed(4)})`;
            }
          }

          return (
            <div
              key={i}
              className="flex-1 h-full flex flex-col justify-center items-center"
              title={title}
            >
              <div
                style={{ height: `${heightPct}%` }}
                className={`w-full max-w-[6px] rounded-xs transition-all ${barBg}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};


export const SignalsView: React.FC<SignalsViewProps> = ({
  theme = 'light',
}) => {
  const [category, setCategory] = useState<SignalCategory>('even_odd');
  const [evenOddStrategyFilter, setEvenOddStrategyFilter] = useState<'all' | 'S1' | 'S2' | 'S3'>('all');
  const [overUnderBarrier, setOverUnderBarrier] = useState<BarrierFilter>('all');
  const [overUnder27Filter, setOverUnder27Filter] = useState<OverUnder27Filter>('all');
  const [onlyUpDownStrategy, setOnlyUpDownStrategy] = useState<OnlyUpDownStrategy>('ema_rsi');
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<
    'all' | 'volatility' | 'volatility-1s' | 'jump' | 'step'
  >('all');
  const [marketSearchQuery, setMarketSearchQuery] = useState<string>('');

  const analysisTicks =
    category === 'only_up' || category === 'only_up_down'
      ? 2
      : category === 'high_low_tick'
      ? 5
      : 1;

  const handleSelectCategory = (newCat: SignalCategory) => {
    setCategory(newCat);
  };

  const handleSelectOnlyUpDownStrategy = (strat: OnlyUpDownStrategy) => {
    setOnlyUpDownStrategy(strat);
  };

  const scannerRef = useRef<MultiMarketSignalScanner | null>(null);
  const [, setTickRevision] = useState<number>(0);

  useEffect(() => {
    const scanner = new MultiMarketSignalScanner();
    scannerRef.current = scanner;
    const unsub = scanner.subscribe(() => {
      setTickRevision((r) => r + 1);
    });
    return () => {
      unsub();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, []);

  const rawSnapshots: MarketSignalSnapshot[] = scannerRef.current
    ? scannerRef.current.getSnapshots(
        category,
        overUnderBarrier,
        analysisTicks,
        evenOddStrategyFilter,
        onlyUpDownStrategy,
        overUnder27Filter
      )
    : [];

  // Hard category invariant: each signal tab strictly holds ONLY its own contract family
  const snapshots: MarketSignalSnapshot[] = rawSnapshots.filter((snap) => {
    if (snap.category !== category) return false;
    if (category === 'only_up') {
      return snap.contractType === 'ONLY_UP';
    }
    if (category === 'even_odd') {
      return snap.contractType === 'EVEN' || snap.contractType === 'ODD';
    }
    if (category === 'over_under' || category === 'over_under_2_7') {
      return snap.contractType === 'OVER' || snap.contractType === 'UNDER';
    }
    if (category === 'only_up_down') {
      return snap.contractType === 'ONLY_UP' || snap.contractType === 'ONLY_DOWN';
    }
    if (category === 'high_low_tick') {
      return snap.contractType === 'HIGH_TICK' || snap.contractType === 'LOW_TICK';
    }
    return snap.contractType === 'MATCHES';
  });

  const marketCounts = useMemo(() => {
    return {
      all: snapshots.length,
      volatility: snapshots.filter((s) => s.market.category === 'volatility').length,
      'volatility-1s': snapshots.filter((s) => s.market.category === 'volatility-1s').length,
      jump: snapshots.filter((s) => s.market.category === 'jump').length,
      step: snapshots.filter((s) => s.market.category === 'step').length,
    };
  }, [snapshots]);

  const filteredSnapshots: MarketSignalSnapshot[] = useMemo(() => {
    return snapshots.filter((snap) => {
      const catMatch =
        marketCategoryFilter === 'all' || snap.market.category === marketCategoryFilter;
      if (!catMatch) return false;
      if (!marketSearchQuery.trim()) return true;
      const q = marketSearchQuery.toLowerCase().trim();
      return (
        snap.market.name.toLowerCase().includes(q) ||
        snap.market.symbol.toLowerCase().includes(q) ||
        snap.market.id.toLowerCase().includes(q)
      );
    });
  }, [snapshots, marketCategoryFilter, marketSearchQuery]);

  const isFeedLive = scannerRef.current?.getIsConnected() ?? false;
  const isLight = theme === 'light';

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* 1. HEADER & LIVE FEED STATUS */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2
              className={`text-xl sm:text-2xl font-extrabold tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              Signals
            </h2>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                isFeedLive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-sky-50 text-sky-700 border-sky-200'
              }`}
            >
              {isFeedLive ? 'Live feed' : 'Syncing feed'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. 5M TIMEFRAME ANALYSIS & STAGGERED SCANNING SUMMARY STRIP */}
      {(category === 'only_up_down' || category === 'high_low_tick') && (
        <div
          className={`w-full rounded-2xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs ${
            isLight
              ? 'bg-cyan-50 border-cyan-200 text-cyan-950'
              : 'bg-[#0b1626] border-cyan-900/40 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`font-bold flex items-center gap-1.5 ${
                isLight ? 'text-cyan-800' : 'text-cyan-400'
              }`}
            >
              <Clock className={`w-4 h-4 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`} />
              <span>5m Analysis Windows:</span>
            </span>
            <span className={`text-[11px] font-mono ${isLight ? 'text-cyan-900' : 'text-slate-300'}`}>
              Staggered 5-minute timeframe scanning across synthetic markets
            </span>
          </div>
          <button
            type="button"
            onClick={() => scannerRef.current?.resetMarketWindows(category)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
              isLight
                ? 'bg-cyan-100 text-cyan-900 border-cyan-300 hover:bg-cyan-200'
                : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/25'
            }`}
            title="Reset all volatility index windows to standard 5m timeframe with staggered offsets"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Defaults (5m)</span>
          </button>
        </div>
      )}

      {/* 3. SIGNAL CATEGORY TABS (Even / Odd | Over / Under | Digit Match | Only Up / Only Down) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleSelectCategory('even_odd')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
              category === 'even_odd'
                ? 'bg-[#2563eb] text-sky-50 border-[#2563eb] shadow-xs'
                : isLight
                ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                : 'bg-[#111827] text-slate-200 border-slate-700 hover:border-slate-500'
            }`}
          >
            Even / Odd
          </button>

          <button
            type="button"
            onClick={() => handleSelectCategory('over_under')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
              category === 'over_under'
                ? 'bg-[#2563eb] text-sky-50 border-[#2563eb] shadow-xs'
                : isLight
                ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                : 'bg-[#111827] text-slate-200 border-slate-700 hover:border-slate-500'
            }`}
          >
            Over / Under
          </button>

          <button
            type="button"
            onClick={() => handleSelectCategory('over_under_2_7')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
              category === 'over_under_2_7'
                ? 'bg-[#2563eb] text-sky-50 border-[#2563eb] shadow-xs'
                : isLight
                ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                : 'bg-[#111827] text-slate-200 border-slate-700 hover:border-slate-500'
            }`}
          >
            Over 2 / Under 7
          </button>

          <button
            type="button"
            onClick={() => handleSelectCategory('digit_match')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
              category === 'digit_match'
                ? 'bg-[#2563eb] text-sky-50 border-[#2563eb] shadow-xs'
                : isLight
                ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                : 'bg-[#111827] text-slate-200 border-slate-700 hover:border-slate-500'
            }`}
          >
            Digit Match
          </button>

          <button
            type="button"
            onClick={() => handleSelectCategory('only_up_down')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
              category === 'only_up_down'
                ? 'bg-[#2563eb] text-sky-50 border-[#2563eb] shadow-xs'
                : isLight
                ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                : 'bg-[#111827] text-slate-200 border-slate-700 hover:border-slate-500'
            }`}
          >
            Only Up / Only Down
          </button>

          <button
            type="button"
            onClick={() => handleSelectCategory('high_low_tick')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
              category === 'high_low_tick'
                ? 'bg-[#2563eb] text-sky-50 border-[#2563eb] shadow-xs'
                : isLight
                ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                : 'bg-[#111827] text-slate-200 border-slate-700 hover:border-slate-500'
            }`}
          >
            High Tick / Low Tick
          </button>

          <button
            type="button"
            onClick={() => handleSelectCategory('only_up')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border flex items-center gap-1.5 ${
              category === 'only_up'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-400/30'
                : isLight
                ? 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                : 'bg-[#111827] text-slate-200 border-slate-700 hover:border-slate-500'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>ONLY UP</span>
          </button>
        </div>

        {category === 'over_under' && (
          <div className="flex items-center gap-1 flex-wrap">
            <span
              className={`text-xs font-semibold mr-0.5 ${
                isLight ? 'text-slate-700' : 'text-slate-400'
              }`}
            >
              Barrier:
            </span>
            <button
              type="button"
              onClick={() => setOverUnderBarrier('all')}
              className={`px-2.5 h-7 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                overUnderBarrier === 'all'
                  ? 'bg-[#2563eb] text-sky-50 border-[#2563eb]'
                  : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
              }`}
            >
              All (2–7)
            </button>
            {([2, 3, 4, 5, 6, 7] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setOverUnderBarrier(b)}
                className={`w-7 h-7 rounded-lg font-mono tabular-nums text-xs font-bold border cursor-pointer transition-colors ${
                  overUnderBarrier === b
                    ? 'bg-[#2563eb] text-sky-50 border-[#2563eb]'
                    : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        )}

        {category === 'over_under_2_7' && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-200 w-full">
            <span className="text-xs font-bold text-slate-700">1000-Tick Filter:</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 gap-0.5">
              {(
                [
                  { id: 'all', label: 'All (Over 2 & Under 7)' },
                  { id: 'over_2', label: 'Over 2 (0,1,2 <10%)' },
                  { id: 'under_7', label: 'Under 7 (7,8,9 <10%)' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setOverUnder27Filter(f.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    overUnder27Filter === f.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono text-slate-500 ml-auto hidden sm:inline">
              1000 Ticks · Below 10% &amp; Not Competing
            </span>
          </div>
        )}

        {category === 'even_odd' && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-200">
            <span className="text-xs font-bold text-slate-700">Strategy Filter:</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 gap-0.5">
              {(
                [
                  { id: 'all', label: 'All (S1, S2, S3)' },
                  { id: 'S1', label: 'S1 · Divergence' },
                  { id: 'S2', label: 'S2 · Dominancy' },
                  { id: 'S3', label: 'S3 · Split Movers' },
                ] as const
              ).map((strat) => (
                <button
                  key={strat.id}
                  type="button"
                  onClick={() => setEvenOddStrategyFilter(strat.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                    evenOddStrategyFilter === strat.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {strat.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono text-slate-500 ml-auto hidden sm:inline">
              🟢 Most (G) · 🔵 2nd (B) · 🔴 Least (R)
            </span>
          </div>
        )}

        {category === 'only_up_down' && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-200">
            <span className="text-xs font-bold text-slate-700">Strategy:</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 gap-0.5">
              <button
                type="button"
                onClick={() => handleSelectOnlyUpDownStrategy('ema_rsi')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  onlyUpDownStrategy === 'ema_rsi'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                5m EMA(5/14) + RSI(7) Retest · 2 Ticks
              </button>
              <button
                type="button"
                onClick={() => handleSelectOnlyUpDownStrategy('momentum')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  onlyUpDownStrategy === 'momentum'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                5m Momentum & Structure · 2 Ticks
              </button>
            </div>
          </div>
        )}
      </div>


      {/* 3C. DERIV SYNTHETIC MARKETS FILTER & SEARCH TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-700 mr-1">Markets:</span>
          {(
            [
              { id: 'all', label: `All (${marketCounts.all})` },
              { id: 'volatility', label: `Plain Vol (${marketCounts.volatility})` },
              { id: 'volatility-1s', label: `1s Vol (${marketCounts['volatility-1s']})` },
              { id: 'jump', label: `Jump (${marketCounts.jump})` },
              { id: 'step', label: `Step (${marketCounts.step})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMarketCategoryFilter(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
                marketCategoryFilter === tab.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex items-center min-w-[200px] sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={marketSearchQuery}
            onChange={(e) => setMarketSearchQuery(e.target.value)}
            placeholder="Search 23 markets (e.g. 15, 30, 90, Jump, Step)..."
            className="w-full pl-8 pr-7 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
          />
          {marketSearchQuery && (
            <button
              type="button"
              onClick={() => setMarketSearchQuery('')}
              className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. HIGH-DENSITY COMPACT MULTI-MARKET BOT CARDS GRID (MOBILE-OPTIMIZED) */}
      {filteredSnapshots.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-slate-300 text-center flex flex-col items-center justify-center gap-2 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">No markets match your current filter</p>
          <button
            type="button"
            onClick={() => {
              setMarketCategoryFilter('all');
              setMarketSearchQuery('');
            }}
            className="px-3 py-1 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            Show All {marketCounts.all} Markets
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
          {filteredSnapshots.map((snap) => {
          const showScanningState = snap.isScanning;
          const displaySignalLabel = snap.signalLabel;
          const displaySignalTone = snap.signalTone;
          const displayContractType = snap.contractType;
          const displayPrediction = snap.prediction;
          const displayConfidencePct = snap.entryConfidencePct;
          const displayPayoutMultiplier = snap.payoutMultiplier;
          const displayDistributionSubtext = snap.distributionSubtext;
          const displayPatternSummary = snap.patternSummary;

          return (
            <div
              key={`${category}-${snap.market.id}`}
              className="relative rounded-xl border p-2.5 sm:p-3 flex flex-col justify-between gap-2.5 transition-all overflow-hidden bg-white shadow-xs hover:shadow-md border-slate-200/90 hover:border-slate-300"
            >
              {/* Compact Card Header */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border bg-slate-100 text-slate-700 border-slate-200">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate">
                        {snap.market.name.replace(' Index', '')}
                      </h3>
                      <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 font-semibold">
                        {snap.market.id}
                      </span>
                      {snap.market.category === 'volatility-1s' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                          1s
                        </span>
                      )}
                      {snap.market.category === 'jump' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          Jump
                        </span>
                      )}
                      {snap.market.category === 'step' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                          Step
                        </span>
                      )}
                    </div>
                    {/* Timeframe & Trend row */}
                    <div className="flex items-center gap-1 text-[10px] font-mono mt-0.5 text-slate-500">
                      {category === 'only_up_down' || category === 'high_low_tick' ? (
                        <>
                          <span className="text-slate-700 font-semibold">{snap.scanWindowLabel}</span>
                          {snap.marketTrend && (
                            <>
                              <span>·</span>
                              <span
                                className={
                                  snap.marketTrend === 'uptrend'
                                    ? 'text-emerald-600 font-semibold'
                                    : snap.marketTrend === 'downtrend'
                                    ? 'text-rose-600 font-semibold'
                                    : 'text-slate-500'
                                }
                              >
                                {snap.marketTrend === 'uptrend'
                                  ? 'Uptrend ▲'
                                  : snap.marketTrend === 'downtrend'
                                  ? 'Downtrend ▼'
                                  : 'Ranging'}
                              </span>
                            </>
                          )}
                        </>
                      ) : category === 'only_up' ? (
                        <span className="text-slate-700 font-semibold">1m MACD</span>
                      ) : (
                        <span className="text-slate-500">
                          {snap.market.category === 'volatility-1s'
                            ? '1s Volatility'
                            : snap.market.category === 'jump'
                            ? 'Jump Index'
                            : snap.market.category === 'step'
                            ? 'Step Index'
                            : 'Volatility Index'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Header: Quote, Digit Badge & Live Stream Dot */}
                <div className="flex items-center gap-1.5 shrink-0">

                  {/* Last Price & Digit Badge */}
                  <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 text-[11px] font-mono tabular-nums">
                    <span className="text-slate-700 hidden sm:inline">{snap.lastQuote}</span>
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] ${
                        snap.lastDigit % 2 === 0
                          ? 'bg-slate-200 text-slate-800 border border-slate-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                      title={`Last digit: ${snap.lastDigit}`}
                    >
                      {snap.lastDigit}
                    </span>
                  </div>

                  {/* Live Stream indicator */}
                  <span
                    title={snap.isLiveWs ? `Live Deriv feed (${snap.lastQuote})` : `Active stream`}
                    className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
                  />
                </div>
              </div>

              {/* Card Body */}
              {showScanningState ? (
                <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <ScanningRing
                      secondsLeft={snap.scanSecondsLeft}
                      totalSeconds={snap.scanTotalSeconds}
                      size={36}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold tracking-wide text-slate-900 uppercase truncate">
                        {snap.isClosingGuard
                          ? 'NO TRADE · CLOSING 20S GUARD'
                          : category === 'only_up_down' && snap.onlyUpDownStrategyId === 'ema_rsi'
                          ? snap.isRsiExtreme
                            ? 'NO TRADE · RSI 35-75 GUARD'
                            : 'ANALYSING 5M EMA & RSI'
                          : category === 'only_up'
                          ? snap.macdHistogramState === 'faded_green'
                            ? 'NO TRADE · FADED GREEN'
                            : snap.macdHistogramState === 'long_dark_red'
                            ? 'NO TRADE · LONG DARK RED'
                            : 'ANALYSING 1M MACD'
                          : category === 'only_up_down'
                          ? `SCANNING ${snap.scanWindowLabel.toUpperCase()} MOMENTUM`
                          : category === 'high_low_tick'
                          ? `ANALYSING ${snap.scanWindowLabel.toUpperCase()} RSI`
                          : category === 'over_under_2_7'
                          ? `ANALYSING ${snap.windowTickCount} TICKS (O2 / U7)`
                          : 'SCANNING PATTERNS'}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                        {snap.scanStatusNote}
                      </span>
                    </div>
                  </div>

                  {category === 'even_odd' && snap.greenBarDigit !== undefined && (
                    <div className="flex items-center gap-1 text-[10px] font-mono font-bold bg-slate-50 p-1 rounded border border-slate-200 justify-between">
                      <span className="text-slate-500 text-[9px]">Movers:</span>
                      <span className="text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-200">
                        🟢 D{snap.greenBarDigit}: {snap.greenBarPct?.toFixed(1)}%
                      </span>
                      <span className="text-blue-700 bg-blue-50 px-1 rounded border border-blue-200">
                        🔵 D{snap.blueBarDigit}: {snap.blueBarPct?.toFixed(1)}%
                      </span>
                      <span className="text-rose-700 bg-rose-50 px-1 rounded border border-rose-200">
                        🔴 D{snap.redBarDigit}: {snap.redBarPct?.toFixed(1)}%
                      </span>
                    </div>
                  )}

                  {category === 'over_under_2_7' && snap.digitPcts1000 && (
                    <div className="flex flex-col gap-1 text-[10px] font-mono bg-slate-50 p-1.5 rounded border border-slate-200">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-bold text-slate-500">O2 (0,1,2):</span>
                        <div className="flex items-center gap-1">
                          {[0, 1, 2].map((d) => {
                            const v = snap.digitPcts1000?.[d] ?? 10;
                            return (
                              <span
                                key={d}
                                className={`px-1 rounded border font-bold ${
                                  v < 10
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {d}:{v.toFixed(1)}%
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-bold text-slate-500">U7 (7,8,9):</span>
                        <div className="flex items-center gap-1">
                          {[7, 8, 9].map((d) => {
                            const v = snap.digitPcts1000?.[d] ?? 10;
                            return (
                              <span
                                key={d}
                                className={`px-1 rounded border font-bold ${
                                  v < 10
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {d}:{v.toFixed(1)}%
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold text-center border truncate transition-colors ${
                      snap.isRsiExtreme
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : snap.macdHistogramState === 'faded_green'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : snap.macdHistogramState === 'long_dark_red'
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {snap.isClosingGuard
                      ? `No trade · Closing 20s (${snap.scanSecondsLeft}s left)`
                      : category === 'only_up_down' && snap.onlyUpDownStrategyId === 'ema_rsi'
                      ? snap.isRsiExtreme
                        ? snap.scanStatusNote
                        : `Awaiting 5m EMA & RSI Good Market...`
                      : category === 'only_up'
                      ? snap.macdHistogramState === 'faded_green'
                        ? `No trade · Faded Green (${snap.scanSecondsLeft}s left)`
                        : snap.macdHistogramState === 'long_dark_red'
                        ? `No trade · Long Dark Red (${snap.scanSecondsLeft}s left)`
                        : `Awaiting Faded Red or Short Dark Green MACD...`
                      : category === 'only_up_down'
                      ? `Awaiting ${snap.scanWindowLabel} trend · market ranging...`
                      : category === 'high_low_tick'
                      ? `Awaiting ${snap.scanWindowLabel} wicks...`
                      : 'Scanning market patterns...'}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                  {/* Signal Badge & Confidence */}
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-extrabold tracking-wide uppercase shrink-0 shadow-2xs ${
                        displaySignalTone === 'emerald'
                          ? 'bg-[#10b981] text-emerald-50'
                          : displaySignalTone === 'fuchsia'
                          ? 'bg-[#c026d3] text-fuchsia-50'
                          : displaySignalTone === 'amber'
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'bg-[#0284c7] text-sky-50'
                      }`}
                    >
                      {displaySignalLabel}
                    </span>

                    <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums">
                      <span className="font-extrabold text-slate-900">
                        {displayConfidencePct}%
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-800 font-extrabold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {displayPayoutMultiplier.toFixed(2)}x
                      </span>
                    </div>
                  </div>

                  {/* Telemetry / Summary */}
                  <div className="text-[11px] font-mono tabular-nums leading-tight truncate text-slate-500">
                    {displayPatternSummary || displayDistributionSubtext}
                  </div>

                  {/* Even/Odd Quantitative Strategy Panel */}
                  {category === 'even_odd' && (
                    <div className="p-2 rounded-lg bg-blue-50/50 border border-blue-100 flex flex-col gap-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-blue-600 text-white border border-blue-700">
                            {snap.evenOddStrategyId || 'Strategy'} Qualified
                          </span>
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            No Competing Opp % ✓
                          </span>
                        </div>
                        {snap.evenDigitsGe10Count !== undefined && snap.oddDigitsGe10Count !== undefined && (
                          <span className="text-[10px] font-mono font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            ≥10%: Even {snap.evenDigitsGe10Count}/5 · Odd {snap.oddDigitsGe10Count}/5
                          </span>
                        )}
                      </div>

                      {snap.greenBarDigit !== undefined && snap.blueBarDigit !== undefined && snap.redBarDigit !== undefined && (
                        <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center">
                          <div className="p-1 rounded bg-emerald-50 border border-emerald-200 flex flex-col">
                            <span className="text-[9px] font-bold text-emerald-800">🟢 Most (G)</span>
                            <span className="font-black text-emerald-900">
                              D{snap.greenBarDigit} ({snap.greenBarPct?.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="p-1 rounded bg-blue-50 border border-blue-200 flex flex-col">
                            <span className="text-[9px] font-bold text-blue-800">🔵 2nd (B)</span>
                            <span className="font-black text-blue-900">
                              D{snap.blueBarDigit} ({snap.blueBarPct?.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="p-1 rounded bg-rose-50 border border-rose-200 flex flex-col">
                            <span className="text-[9px] font-bold text-rose-800">🔴 Least (R)</span>
                            <span className="font-black text-rose-900">
                              D{snap.redBarDigit} ({snap.redBarPct?.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      )}

                      {snap.evenOddEntryRuleText && (
                        <div className="text-[10px] font-medium text-blue-950 bg-white p-1.5 rounded border border-blue-200 flex items-center justify-between gap-1">
                          <span className="truncate">🎯 {snap.evenOddEntryRuleText}</span>
                          {snap.evenOddEntryDigit !== undefined && (
                            <span className="font-mono font-black text-blue-700 shrink-0 bg-blue-100 px-1 rounded">
                              Target: D{snap.evenOddEntryDigit}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Over 2 / Under 7 (1000-Tick) Breakdown Panel */}
                  {category === 'over_under_2_7' && snap.digitPcts1000 && (
                    <div className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-200 flex flex-col gap-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-emerald-600 text-white">
                          {snap.windowTickCount} Ticks · {snap.signalLabel}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          &lt;10% &amp; Not Competing ✓
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center">
                        {(displayContractType === 'OVER' ? [0, 1, 2] : [7, 8, 9]).map((d) => {
                          const pctVal = snap.digitPcts1000?.[d] ?? 0;
                          return (
                            <div
                              key={d}
                              className="p-1 rounded bg-white border border-emerald-200 flex flex-col"
                            >
                              <span className="text-[9px] font-bold text-slate-500">Digit {d}</span>
                              <span className="font-black text-emerald-700">
                                {pctVal.toFixed(1)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ONLY UP / DOWN 5m EMA(5/14) + RSI(7) Strategy Panel */}
                  {category === 'only_up_down' && snap.onlyUpDownStrategyId === 'ema_rsi' && (
                    <div className="p-2 rounded-lg bg-blue-50/50 border border-blue-100 flex flex-col gap-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border flex items-center gap-1 ${
                              snap.isEmaGoodMarket && !snap.isRsiExtreme
                                ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                                : snap.isRsiExtreme
                                ? 'bg-rose-100 border-rose-400 text-rose-800'
                                : 'bg-amber-100 border-amber-400 text-amber-800'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                snap.isEmaGoodMarket && !snap.isRsiExtreme
                                  ? 'bg-emerald-500 animate-ping'
                                  : 'bg-slate-400'
                              }`}
                            />
                            <span>
                              {snap.isRsiExtreme
                                ? 'RSI 35–75 Guard'
                                : snap.isEmaGoodMarket
                                ? 'Good Market Active'
                                : 'Awaiting Setup'}
                            </span>
                          </span>
                          <span
                            className={`text-[10px] font-mono font-bold ${
                              snap.isEmaGoodMarket && !snap.isRsiExtreme
                                ? 'text-emerald-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {snap.isEmaGoodMarket && !snap.isRsiExtreme ? 'Signal Active ✔' : 'Wait ✕'}
                          </span>
                        </div>

                        <span className="text-[10px] font-mono font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          Window: 2 Ticks
                        </span>
                      </div>

                      {/* Indicators Row: EMA 5, EMA 14, RSI 7 */}
                      <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center">
                        <div className="p-1 rounded bg-white border border-slate-200 flex flex-col">
                          <span className="text-[9px] font-bold text-slate-500">EMA (5)</span>
                          <span className="font-black text-slate-900">
                            {snap.ema1Value !== undefined ? snap.ema1Value.toFixed(2) : '—'}
                          </span>
                        </div>
                        <div className="p-1 rounded bg-white border border-slate-200 flex flex-col">
                          <span className="text-[9px] font-bold text-slate-500">EMA (14)</span>
                          <span className="font-black text-slate-900">
                            {snap.ema2Value !== undefined ? snap.ema2Value.toFixed(2) : '—'}
                          </span>
                        </div>
                        <div
                          className={`p-1 rounded border flex flex-col ${
                            snap.isRsiExtreme
                              ? 'bg-rose-50 border-rose-300 text-rose-900'
                              : snap.rsiValue !== undefined &&
                                ((snap.contractType === 'ONLY_UP' && snap.rsiValue > 50) ||
                                  (snap.contractType === 'ONLY_DOWN' && snap.rsiValue < 50))
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                              : 'bg-white border-slate-200 text-slate-900'
                          }`}
                        >
                          <span className="text-[9px] font-bold text-slate-500">RSI (7) [35–75]</span>
                          <span className="font-black">
                            {snap.rsiValue !== undefined ? snap.rsiValue.toFixed(1) : '50.0'}
                          </span>
                        </div>
                      </div>

                      {/* Retest / Pullback Status */}
                      <div className="text-[10px] font-medium text-blue-950 bg-white p-1.5 rounded border border-blue-200 flex items-center justify-between gap-1">
                        <span className="truncate">
                          🔄 {snap.retestStatusText || 'Waiting for 2-candle pullback'}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-black font-mono shrink-0 ${
                            snap.entryConfirmedNow
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-50 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {snap.entryConfirmedNow ? '⚡ Entry Ready' : 'Armed (Wait Entry)'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* ONLY UP MACD Candlestick Strategy Panel */}
                  {category === 'only_up' && (
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex flex-col gap-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border flex items-center gap-1 ${
                              snap.macdHistogramState === 'short_dark_green'
                                ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                                : snap.macdHistogramState === 'faded_red'
                                ? 'bg-rose-100 border-rose-400 text-rose-800'
                                : snap.macdHistogramState === 'long_dark_red'
                                ? 'bg-red-100 border-red-400 text-red-800'
                                : snap.macdHistogramState === 'faded_green'
                                ? 'bg-amber-100 border-amber-400 text-amber-800'
                                : 'bg-slate-100 border-slate-200 text-slate-700'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                snap.isMacdGoodMarket
                                  ? 'bg-emerald-500 animate-ping'
                                  : snap.macdHistogramState === 'long_dark_red'
                                  ? 'bg-red-500'
                                  : snap.macdHistogramState === 'faded_green'
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400'
                              }`}
                            />
                            <span>{snap.macdStateLabel || 'MACD Histogram'}</span>
                          </span>
                          <span className={`text-[10px] font-mono font-bold ${snap.isMacdGoodMarket ? 'text-emerald-700' : 'text-slate-600'}`}>
                            {snap.isMacdGoodMarket ? 'Good Market ✔' : 'No Trade ✕'}
                          </span>
                        </div>

                        <div
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border flex items-center gap-1 ${
                            snap.is10sEntryActive
                              ? 'bg-emerald-600 text-white border-emerald-500 animate-pulse font-black'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          <span>
                            {snap.is10sEntryActive
                              ? `⚡ 10s Active (${formatTradingViewCountdown(snap.candleSecondsLeft ?? 10)})`
                              : `TV: ${formatTradingViewCountdown(snap.candleSecondsLeft ?? 60)} left`}
                          </span>
                        </div>
                      </div>

                      {/* Mini MACD Histogram Bars Visualizer */}
                      <MacdMiniHistogram histograms={snap.recentMacdHistograms} />
                    </div>
                  )}

                  {/* Signal Entry Status Footer */}
                  {category === 'only_up' ? (
                    snap.isMacdGoodMarket ? (
                      <div className="w-full py-1.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between gap-2 bg-emerald-600 text-white border border-emerald-500">
                        <span className="flex items-center gap-1.5 shrink-0">
                          <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
                          <span>ONLY UP SIGNAL</span>
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-50 font-mono truncate">
                          {snap.is10sEntryActive
                            ? `⚡ 10s Window Active (${formatTradingViewCountdown(snap.candleSecondsLeft ?? 10)})`
                            : `Armed · Enters ≤10s (${formatTradingViewCountdown(snap.candleSecondsLeft ?? 60)})`}
                        </span>
                      </div>
                    ) : snap.macdHistogramState === 'long_dark_red' ? (
                      <div className="w-full py-1.5 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 border bg-rose-50 text-rose-700 border-rose-200">
                        <span>NO TRADE · Long Dark Red</span>
                        <span className="text-[10px] font-mono text-rose-500">
                          Falling momentum
                        </span>
                      </div>
                    ) : snap.macdHistogramState === 'faded_green' ? (
                      <div className="w-full py-1.5 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 border bg-amber-50 text-amber-700 border-amber-200">
                        <span>NO TRADE · Faded Green</span>
                        <span className="text-[10px] font-mono text-amber-600">
                          Declining momentum
                        </span>
                      </div>
                    ) : (
                      <div className="w-full py-1.5 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 border bg-blue-50 text-blue-700 border-blue-200">
                        <span className="truncate">Awaiting Faded Red or Short Dark Green MACD</span>
                        <span className="text-[10px] font-mono text-blue-600 shrink-0">
                          {formatTradingViewCountdown(snap.candleSecondsLeft ?? 60)} left
                        </span>
                      </div>
                    )
                  ) : (
                    <div
                      className={`w-full py-1.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between gap-2 border ${
                        snap.entryConfirmedNow
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : 'bg-blue-600 text-white border-blue-500'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 shrink-0">
                        <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
                        <span>
                          {category === 'only_up_down'
                            ? `ONLY ${snap.contractType === 'ONLY_UP' ? 'UP' : 'DOWN'} (2 Ticks)`
                            : category === 'even_odd' && snap.evenOddStrategyId
                            ? `${snap.contractType} (${snap.evenOddStrategyId})`
                            : displaySignalLabel}
                        </span>
                      </span>
                      <span className="text-[10px] sm:text-[11px] font-semibold text-blue-50 font-mono truncate">
                        {category === 'only_up_down'
                          ? snap.entryConfirmedNow
                            ? '⚡ Pullback Confirmed · Ready'
                            : 'Armed · Waits for Pullback'
                          : snap.entryConfirmedNow
                          ? '⚡ Entry Ready Now'
                          : category === 'even_odd' && snap.evenOddEntryRuleText
                          ? snap.evenOddEntryRuleText
                          : 'Waits for Confirmation'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Compact Recent Ticks / Directions Strip */}
              <div className="flex items-center gap-1 overflow-x-auto pt-1 border-t border-slate-100">
                {category === 'only_up_down' || category === 'high_low_tick' || category === 'only_up'
                  ? (snap.recentDirections ?? []).slice(-10).map((dir, idx) => {
                      const symbol = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '·';
                      const tileColorClass =
                        dir === 'up'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : dir === 'down'
                          ? 'bg-rose-50 border-rose-300 text-rose-700'
                          : 'bg-slate-100 border-slate-200 text-slate-500';
                      return (
                        <span
                          key={`${category}-${snap.market.id}-dir-${idx}`}
                          title={
                            dir === 'up'
                              ? 'Rise tick (▲)'
                              : dir === 'down'
                              ? 'Fall tick (▼)'
                              : 'Flat tick'
                          }
                          className={`w-5 h-5 rounded border font-mono tabular-nums text-[9px] font-bold flex items-center justify-center shrink-0 ${tileColorClass}`}
                        >
                          {symbol}
                        </span>
                      );
                    })
                  : snap.recentDigits.slice(-10).map((d, idx) => {
                      const isPositiveTile =
                        category === 'even_odd'
                          ? displayContractType === 'EVEN'
                            ? d % 2 === 0
                            : d % 2 !== 0
                          : category === 'over_under' || category === 'over_under_2_7'
                          ? displayContractType === 'OVER'
                            ? d > displayPrediction
                            : d < displayPrediction
                          : d === (showScanningState ? snap.hotDigit : displayPrediction);

                      return (
                        <span
                          key={`${category}-${snap.market.id}-d-${idx}`}
                          className={`w-5 h-5 rounded border font-mono tabular-nums text-[9px] font-bold flex items-center justify-center shrink-0 ${
                            isPositiveTile
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
                          }`}
                        >
                          {d}
                        </span>
                      );
                    })}
              </div>
            </div>
          );
        })}
      </div>
    )}
    </div>
  );
};
