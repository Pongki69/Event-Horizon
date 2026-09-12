// CountdownBadge.jsx
// Isolated countdown component that updates independently without causing parent re-renders

import { useState, useEffect, memo } from 'react';
import { getCountdownAsia, getTimeUntilStartAsia } from '../utils/dateUtils';

// Get badge color based on days remaining
const getBadgeColor = (days) => {
  if (days < 1) return '#ef4444'; // Red for less than 1 day
  if (days < 3) return '#f59e0b'; // Yellow/Orange for less than 3 days
  return '#10b981'; // Green for 3+ days
};

// Format countdown text responsively based on screen size
const formatCountdown = (countdown, isShort = false) => {
  if (!countdown) return '';
  
  // Hide days if 0, show only hours and minutes
  if (countdown.days === 0) {
    return `${countdown.hours}h ${countdown.minutes}m`;
  }
  
  // Show days, hours, and minutes
  return `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m`;
};

// Format "Starts in" text responsively
const formatStartsIn = (timeUntilStart, isShort = false) => {
  if (!timeUntilStart) return '';
  
  // Always use compact format for "Starts in" to prevent clipping
  if (timeUntilStart.days > 0) {
    return `In ${timeUntilStart.days}d ${timeUntilStart.hours}h`;
  } else if (timeUntilStart.hours > 0) {
    return `In ${timeUntilStart.hours}h ${timeUntilStart.minutes}m`;
  } else {
    return `In ${timeUntilStart.minutes}m`;
  }
};

function CountdownBadge({ endDate, startDate, timezone = 'UTC+8', isUpcoming, isEnded, endNote, useShortFormat = false }) {
  const [countdown, setCountdown] = useState(null);
  
  // Handle TBA dates for future unannounced content
  if (startDate === 'TBA' || endDate === 'TBA') {
    return (
      <div 
        className="countdown-badge" 
        style={{ 
          backgroundColor: '#8b5cf6',
          fontWeight: '600',
          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
        }}
      >
        TBA
      </div>
    );
  }
  
  useEffect(() => {
    // If event has ended or is permanent, no need to update countdown
    if (isEnded || endNote === 'Permanent') {
      return;
    }
    
    // Handle indefinite end dates
    if (endDate === 'Indefinite') {
      return;
    }
    
    const updateCountdown = () => {
      if (isUpcoming) {
        const timeUntilStart = getTimeUntilStartAsia(new Date(startDate), timezone);
        setCountdown(timeUntilStart);
      } else {
        const cd = getCountdownAsia(new Date(endDate), timezone);
        setCountdown(cd);
      }
    };
    
    // Initial update
    updateCountdown();
    
    // Update every 60 seconds on mobile for better performance, every second on desktop
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 767;
    const updateInterval = isMobile ? 60000 : 1000; // 60s on mobile, 1s on desktop
    
    const interval = setInterval(updateCountdown, updateInterval);
    
    return () => clearInterval(interval);
  }, [endDate, startDate, timezone, isUpcoming, isEnded, endNote]);
  
  // Show "Indefinite" badge for indefinite events
  if (endDate === 'Indefinite') {
    return (
      <div 
        className="countdown-badge" 
        style={{ 
          backgroundColor: '#8b5cf6',
          fontWeight: '600',
          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
        }}
      >
        Indefinite
      </div>
    );
  }
  
  // Show "Permanent" badge for permanent events
  if (endNote === 'Permanent') {
    return (
      <div 
        className="countdown-badge" 
        style={{ 
          backgroundColor: '#8b5cf6',
          fontWeight: '600',
          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
        }}
      >
        Permanent
      </div>
    );
  }
  
  // Show "Ended" badge for past events
  if (isEnded) {
    return (
      <div 
        className="countdown-badge" 
        style={{ 
          backgroundColor: '#6b7280',
          fontWeight: '600',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}
      >
        Ended
      </div>
    );
  }
  
  if (!countdown) return null;
  
  const backgroundColor = isUpcoming ? '#3b82f6' : getBadgeColor(countdown.days);
  const boxShadow = isUpcoming 
    ? '0 2px 8px rgba(59, 130, 246, 0.3)' 
    : '0 2px 8px rgba(0,0,0,0.15)';
  
  return (
    <div 
      className="countdown-badge" 
      style={{ 
        backgroundColor,
        fontWeight: '600',
        boxShadow
      }}
    >
      {isUpcoming 
        ? formatStartsIn(countdown, useShortFormat)
        : formatCountdown(countdown, useShortFormat)
      }
    </div>
  );
}

// Memo to prevent re-renders when parent updates
export default memo(CountdownBadge);
