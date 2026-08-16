// VisitorCounter.jsx
// Pings Cloudflare Worker to count unique visitors (IP-based, 24h dedup)
// Reads the actual count from /visitor-count.json (updated by GitHub Actions)

import { useState, useEffect } from 'react';

// Replace with your Cloudflare Worker URL after deploying
const WORKER_URL = '/api/visitor';

export default function VisitorCounter() {
  const [count, setCount] = useState(null);

  useEffect(() => {
    // Ping the worker (handles IP dedup + triggers GitHub Actions)
    // Only ping once per browser session
    const sessionKey = 'eh_pinged';
    if (!sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, 'true');
      // Also check localStorage for long-term dedup
      if (!localStorage.getItem('eh_visited')) {
        localStorage.setItem('eh_visited', '1');
        fetch(WORKER_URL, { credentials: 'include' }).catch(() => {});
      }
    }

    // Read count from local static file (updated by GitHub Actions on each new visitor)
    fetch('/visitor-count.json')
      .then(r => r.json())
      .then(data => { if (data.count != null) setCount(data.count); })
      .catch(() => {});
  }, []);

  if (count === null) return null;

  return (
    <div
      title="Total visitors"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        color: '#9ca3af',
        fontSize: '14px',
        fontWeight: 600,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.7 }}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      {count.toLocaleString()} visitors
    </div>
  );
}
