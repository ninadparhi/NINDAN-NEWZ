import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, dayLabel, localDay, ago } from './ui.jsx';

// Format a date like "FRIDAY, NOVEMBER 6, 2026"
function formatEditorialDate(isoDate) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'Today';
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const months = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  ];
  const dayName = days[d.getDay()];
  const monthName = months[d.getMonth()];
  const dayNum = d.getDate();
  const year = d.getFullYear();
  return `${dayName}, ${monthName} ${dayNum}, ${year}`;
}

// Navigate dates by delta (in days)
function addDays(date, delta) {
  const result = new Date(date);
  result.setDate(result.getDate() + delta);
  return result.toISOString().slice(0, 10);
}

export default function DateArchiveBar({
  // Controls: called when date changes
  onDateChange,
  // Current selected date (ISO string, e.g. "2026-11-06")
  selectedDate,
  // Whether we're viewing an archive date (not today)
  isArchive,
  // Number of past days to show in the strip (7-14)
  pastDays = 14,
}) {
  // Compute the strip dates: today + pastDays going back
  const stripDates = useMemo(() => {
    const dates = [];
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i <= pastDays; i++) {
      dates.push(addDays(today, -i));
    }
    return dates;
  }, [pastDays]);

  // Format each strip date
  const stripItems = useMemo(() => stripDates.map((iso) => {
    const d = new Date(iso);
    const isToday = iso === localDay(0); // localDay(0) returns today's YYYY-MM-DD
    const label = isToday ? 'Today' : dayLabel(iso);
    const formatted = formatEditorialDate(iso);
    return { iso, label, formatted, isToday };
  }), [stripDates, localDay]);

  // Handle date button click
  const handleStripClick = useCallback((iso) => {
    const isToday = iso === localDay(0);
    onDateChange(iso, isToday);
  }, [localDay, onDateChange]);

  // Arrow click: scroll further back
  const handleArrowClick = useCallback((delta) => {
    // delta is positive = go back more days
    onDateChange(addDays(localDay(0), delta), true);
  }, [onDateChange]);

  // Custom date open (simple prompt - in a real app this would be a modal)
  const handleCustomDate = useCallback((value) => {
    if (!value) return;
    const parsed = valueAsDate(value);
    if (parsed) {
      onDateChange(parsed, parsed === localDay(0));
    }
  }, [onDateChange]);

  function valueAsDate(val) {
    // Accept YYYY-MM-DD or MM/DD/YYYY
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, y, mo, d] = m;
      const date = new Date(+y, +mo - 1, +d);
      if (!isNaN(date.getTime()) && date <= new Date()) return date.toISOString().slice(0, 10);
    }
    return null;
  }

  // Disable future dates CSS class
  const futureClass = 'opacity-40 cursor-not-allowed';

  return (
    <div className="mb-6 border-y border-line bg-surface2/50 pt-4 pb-2">
      {/* Editorial date header */}
      <div className="flex flex-col gap-1 max-w-[42rem] mx-auto">
        <h1 className="font-head text-lg font-serif text-ink tracking-wider">
          {formatEditorialDate(selectedDate)}</h1>
        {isArchive && (
          <p className="text-xs text-muted/70 font-medium">
            Viewing Archive: {dayLabel(selectedDate)} — <span className="font-medium" onClick={() => onDateChange(localDay(0), true)}>Return to Today</span>
          </p>
        )}
      </div>

      {/* Horizontal date strip */}
      <div className="mt-3 flex items-center gap-1 overflow-x-auto scrollbar-hide py-1" aria-label="Date navigation strip">
        {/* Left arrow */}
        <button
          onClick={() => handleArrowClick(7)}
          className="rounded-lg border border-line px-3 py-1 text-[10px] font-medium transition-colors hover:text-accent hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Scroll back 7 days"
        >
          <span aria-hidden /> Left
        </button>

        {/* Strip items */}
        {stripItems.map((item) => {
          const isSelected = item.iso === selectedDate;
          const isFuture = new Date(item.iso) > new Date(localDay(0));
          return (
            <button
              key={item.iso}
              onClick={() => handleStripClick(item.iso)}
              className={`rounded-full border ${isSelected ? 'bg-ink text-paper' : 'border-line text-muted hover:text-ink hover:border-accent transition-colors'} ${isFuture ? futureClass : ''} flex items-center gap-2 ${isSelected ? 'underline' : ''} whitespace-nowrap`}
              aria-selected={isSelected}
              aria-label={item.label}
            >
              <span className="text-[10px] font-semibold capitalize">{item.label}</span>
            </button>
          );
        })}

        {/* Right arrow (always enabled, goes forward to today+1 which gets clamped) */}
        <button
          onClick={() => handleArrowClick(-7)}
          className="rounded-lg border border-line px-3 py-1 text-[10px] font-medium transition-colors hover:text-accent hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Scroll forward 7 days"
        >
          Right <span aria-hidden />
        </button>
      </div>

      {/* Custom date picker - simple inline input */}
      <div className="mt-3 flex gap-2">
        <input
          type="date"
          value=""
          onChange={(e) => handleCustomDate(e.target.value)}
          className="rounded-lg border border-line px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 w-40"
          aria-label="Custom date"
          disabled
          placeholder="Select date"
        />
        <button
          onClick={() => alert('Custom date picker would open a calendar modal')}
          className="rounded-xl bg-ink px-3 py-1 text-sm font-medium text-white hover:opacity-90"
        >
          Go
        </button>
      </div>
    </div>
  );
}

// Hide scrollbar but keep scrolling
const style = document.createElement('style');
style.textContent = '.scrollbar-hide::-webkit-scrollbar { display: none; }';
document.head.appendChild(style);