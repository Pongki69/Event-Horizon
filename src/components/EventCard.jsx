// EventCard.jsx
// Memoized event card component to prevent unnecessary re-renders

import { memo } from 'react';
import CountdownBadge from './CountdownBadge';
import { isEventEndedAsia } from '../utils/dateUtils';

// Helper function to format game name for display
const formatGameName = (game) => {
  if (game === 'Star Rail') {
    return 'Honkai: Star Rail';
  }
  return game;
};

const EventCard = memo(({ 
  event, 
  onClick, 
  useShortFormat,
  isUpcoming = false
}) => {
  // Use eager loading on mobile for better scroll performance
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 767;
  const loadingStrategy = isMobile ? 'eager' : 'lazy';
  
  return (
    <button
      onClick={onClick}
      className="media-row"
      style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', position: 'relative' }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {event.image ? (
          <img 
            className="placeholder-img" 
            src={event.image} 
            alt={event.title} 
            width="100" 
            height="60" 
            loading={loadingStrategy}
            decoding="async"
            fetchPriority={isMobile ? "high" : "auto"}
          />
        ) : (
          <div className="placeholder-img placeholder-no-image">
            No Image
          </div>
        )}
        <CountdownBadge 
          endDate={event.end} 
          startDate={event.start}
          timezone={event.timezone || 'UTC+8'}
          endNote={event.endNote} 
          isEnded={isEventEndedAsia(event.end)} 
          useShortFormat={useShortFormat}
          isUpcoming={isUpcoming}
        />
      </div>
      <div className="media-text">
        <p style={{ marginBottom: '4px' }}>{event.title}</p>
        <span style={{ 
          fontSize: '0.65rem',
          color: '#a78bfa',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {formatGameName(event.game)}
        </span>
      </div>
    </button>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function - only re-render if these props change
  return (
    prevProps.event.title === nextProps.event.title &&
    prevProps.event.image === nextProps.event.image &&
    prevProps.useShortFormat === nextProps.useShortFormat &&
    prevProps.isUpcoming === nextProps.isUpcoming
  );
});

EventCard.displayName = 'EventCard';

export default EventCard;
