// CustomCalendar.tsx
// Custom calendar component with full styling control
// Built from scratch for dark mode with clean grid lines
// Optimized for mobile performance

import { useState, useMemo, useCallback, memo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import './CustomCalendar.css';

export interface Event {
  title: string;
  start: Date;
  end: Date | 'Indefinite';
  allDay?: boolean;
  image?: string;
  description?: string;
  game?: string;
  endNote?: string;
  timezone?: string;
  wikiUrl?: string;
}

type Props = {
  events: Event[];
  onSelectEvent?: (event: Event) => void;
  onShowMore?: (date: Date, events: Event[]) => void;
};

// Memoized event bar component for better performance
const EventBar = memo(({ item, getGameColor, onSelectEvent }: any) => (
  <div
    className="event-bar-continuous"
    style={{
      gridColumn: `${item.startCol} / span ${item.span}`,
      gridRow: item.rowIndex + 1,
      backgroundColor: getGameColor(item.event.game),
    }}
    onClick={() => onSelectEvent?.(item.event)}
  >
    {item.event.image && item.startCol === 1 && (
      <img 
        src={item.event.image} 
        alt={item.event.title} 
        className="event-image" 
        loading="lazy"
        decoding="async"
      />
    )}
    <span className="event-title">{item.event.title}</span>
  </div>
));

EventBar.displayName = 'EventBar';

function CustomCalendar({ events, onSelectEvent, onShowMore }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);
  const startDate = useMemo(() => startOfWeek(monthStart), [monthStart]);
  const endDate = useMemo(() => endOfWeek(monthEnd), [monthEnd]);

  // Filter events to only show those that overlap with the displayed month
  // This improves performance by not rendering events outside the current view
  // An event overlaps if: event.start <= month_end AND event.end >= month_start
  const visibleEvents = useMemo(() => {
    const viewStart = new Date(monthStart);
    viewStart.setHours(0, 0, 0, 0);
    const viewEnd = new Date(monthEnd);
    viewEnd.setHours(23, 59, 59, 999);
    
    return events.filter(event => {
      const eventStart = new Date(event.start);
      // Handle 'Indefinite' end dates - show for 30 days on calendar only
      const eventEnd = event.end === 'Indefinite' 
        ? new Date(eventStart.getTime() + (30 * 24 * 60 * 60 * 1000)) 
        : new Date(event.end);
      
      // Show event if it overlaps with the displayed month
      // Overlap condition: event starts before or during month AND event ends during or after month
      return eventStart <= viewEnd && eventEnd >= viewStart;
    });
  }, [events, monthStart, monthEnd]);

  const handlePrevMonth = useCallback(() => setCurrentDate(prev => subMonths(prev, 1)), []);
  const handleNextMonth = useCallback(() => setCurrentDate(prev => addMonths(prev, 1)), []);
  const handlePrevYear = useCallback(() => setCurrentDate(prev => subMonths(prev, 12)), []);
  const handleNextYear = useCallback(() => setCurrentDate(prev => addMonths(prev, 12)), []);
  const handleToday = useCallback(() => setCurrentDate(new Date()), []);

  // Memoized color getter
  const getGameColor = useCallback((game?: string): string => {
    switch (game) {
      case 'Genshin Impact': return '#FFB84D';
      case 'Star Rail': return '#9D7FEA';
      case 'Zenless Zone Zero': return '#FF6B35';
      case 'Wuthering Waves': return '#4ECDC4';
      case 'Arknights: Endfield': return '#F87171';
      default: return '#9D7FEA';
    }
  }, []);

  // Get events for a specific date
  const getEventsForDate = useCallback((date: Date): Event[] => {
    return visibleEvents.filter(event => {
      const eventStart = new Date(new Date(event.start).toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
      // Handle 'Indefinite' end dates - show for 30 days on calendar only
      const eventEndDate = event.end === 'Indefinite' 
        ? new Date(new Date(event.start).getTime() + (30 * 24 * 60 * 60 * 1000))
        : new Date(event.end);
      const eventEnd = new Date(eventEndDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
      const dayStart = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
      dayEnd.setHours(23, 59, 59, 999);
      return eventStart <= dayEnd && eventEnd >= dayStart;
    });
  }, [visibleEvents]);

  // Render calendar grid - optimized
  const renderCells = useMemo(() => {
    const rows = [];
    let day = startDate;

    while (day <= endDate) {
      const weekStart = day;
      const weekEnd = addDays(weekStart, 6);
      const weekDays = [];
      const weekEvents: Array<{event: Event, startCol: number, span: number, rowIndex: number}> = [];
      
      // Collect days for this week
      for (let i = 0; i < 7; i++) {
        const currentDay = addDays(weekStart, i);
        const isToday = isSameDay(currentDay, new Date());
        const isCurrentMonth = isSameMonth(currentDay, monthStart);
        const dayEvents = getEventsForDate(currentDay);
        
        weekDays.push(
          <div
            key={currentDay.toString()}
            className={`calendar-cell ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
          >
            <div className="date-number">{format(currentDay, 'd')}</div>
            {dayEvents.length > 3 && (
              <button
                className="show-more-btn"
                onClick={() => onShowMore?.(currentDay, dayEvents)}
              >
                +{dayEvents.length - 3} more
              </button>
            )}
          </div>
        );
      }
      
      // Find events for this week
      visibleEvents.forEach(event => {
        const eventStart = new Date(new Date(event.start).toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
        eventStart.setHours(0, 0, 0, 0);
        // Handle 'Indefinite' end dates - show for 30 days on calendar only
        const eventEndDate = event.end === 'Indefinite' 
          ? new Date(new Date(event.start).getTime() + (30 * 24 * 60 * 60 * 1000))
          : new Date(event.end);
        const eventEnd = new Date(eventEndDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
        eventEnd.setHours(0, 0, 0, 0);
        
        const weekStartTime = new Date(weekStart.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
        weekStartTime.setHours(0, 0, 0, 0);
        const weekEndTime = new Date(weekEnd.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
        weekEndTime.setHours(23, 59, 59, 999);
        
        if (eventStart <= weekEndTime && eventEnd.getTime() >= weekStartTime.getTime()) {
          let startCol = 1;
          if (eventStart >= weekStartTime) {
            const daysDiff = Math.floor((eventStart.getTime() - weekStartTime.getTime()) / (1000 * 60 * 60 * 24));
            startCol = daysDiff + 1;
          }
          
          const visibleStart = eventStart < weekStartTime ? weekStartTime : eventStart;
          const visibleEnd = eventEnd > weekEndTime ? weekEndTime : eventEnd;
          const span = Math.floor((visibleEnd.getTime() - visibleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          weekEvents.push({ event, startCol, span, rowIndex: 0 });
        }
      });
      
      // Sort and assign row indices
      weekEvents.sort((a, b) => {
        if (a.startCol !== b.startCol) return a.startCol - b.startCol;
        return new Date(a.event.start).getTime() - new Date(b.event.start).getTime();
      });
      
      weekEvents.forEach((item, idx) => {
        item.rowIndex = idx;
      });
      
      rows.push(
        <div className="calendar-row" key={weekStart.toString()}>
          <div className="calendar-week-grid">
            {weekDays}
            <div className="events-overlay">
              {weekEvents.slice(0, 3).map((item) => (
                <EventBar
                  key={`${item.event.title}-${item.startCol}`}
                  item={item}
                  getGameColor={getGameColor}
                  onSelectEvent={onSelectEvent}
                />
              ))}
            </div>
          </div>
        </div>
      );
      
      day = addDays(day, 7);
    }
    
    return { rows, rowCount: rows.length };
  }, [startDate, endDate, monthStart, visibleEvents, onSelectEvent, onShowMore, getEventsForDate, getGameColor]);

  const renderHeader = useMemo(() => {
    const days = [];
    const dateFormat = 'EEE';
    let startDay = startOfWeek(currentDate);

    for (let i = 0; i < 7; i++) {
      days.push(
        <div className="calendar-header-cell" key={i}>
          {format(addDays(startDay, i), dateFormat).toUpperCase()}
        </div>
      );
    }
    return <div className="calendar-header">{days}</div>;
  }, [currentDate]);

  return (
    <div className="custom-calendar">
      <div className="calendar-toolbar">
        <div className="toolbar-left">
          <button className="toolbar-btn" onClick={handleToday}>Today</button>
        </div>
        <div className="toolbar-center-right-wrapper">
          <button className="toolbar-btn toolbar-btn-year" onClick={handlePrevYear} title="Previous Year">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="11 17 6 12 11 7"></polyline>
              <polyline points="18 17 13 12 18 7"></polyline>
            </svg>
          </button>
          <button className="toolbar-btn toolbar-btn-month" onClick={handlePrevMonth} title="Previous Month"></button>
          <div className="toolbar-label">{format(currentDate, 'MMMM yyyy')}</div>
          <button className="toolbar-btn toolbar-btn-month" onClick={handleNextMonth} title="Next Month"></button>
          <button className="toolbar-btn toolbar-btn-year" onClick={handleNextYear} title="Next Year">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="13 17 18 12 13 7"></polyline>
              <polyline points="6 17 11 12 6 7"></polyline>
            </svg>
          </button>
        </div>
      </div>
      {renderHeader}
      <div className={`calendar-body ${renderCells.rowCount >= 6 ? 'has-six-rows' : renderCells.rowCount >= 5 ? 'has-five-rows' : ''}`}>
        {renderCells.rows}
      </div>
    </div>
  );
}

export default memo(CustomCalendar);
