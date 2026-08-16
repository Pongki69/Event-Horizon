// GameCalendar.tsx
// Wrapper for CustomCalendar component
// Exports events and provides the same interface as before

import CustomCalendar, { Event } from './CustomCalendar';
import { scrapedStarRailEvents } from '../data/scrapedStarRailEvents';
import { scrapedStarRailHistoryEvents } from '../data/scrapedStarRailHistoryEvents';
import { scrapedGenshinEvents } from '../data/scrapedGenshinEvents';
import { scrapedGenshinHistoryEvents } from '../data/scrapedGenshinHistoryEvents';
import { scrapedZZZEvents } from '../data/scrapedZZZEvents';
import { scrapedZZZHistoryEvents } from '../data/scrapedZZZHistoryEvents';
import { scrapedWuwaEvents } from '../data/scrapedWuwaEvents';
import { scrapedWuwaHistoryEvents } from '../data/scrapedWuwaHistoryEvents';
import { getRecurringZZZEndgame } from '../data/recurringZZZEndgame';
import { getRecurringGenshinEndgame } from '../data/recurringGenshinEndgame';
import { scrapedStarRailEndgame } from '../data/scrapedStarRailEndgame';
import { getRecurringWuwaEndgame } from '../data/recurringWuwaEndgame';

// Combine events from all games (including all historical events)
const combinedEvents: Event[] = [
  ...scrapedStarRailEvents,
  ...scrapedStarRailHistoryEvents,
  ...scrapedGenshinEvents,
  ...scrapedGenshinHistoryEvents,
  ...scrapedZZZEvents,
  ...scrapedZZZHistoryEvents,
  ...scrapedWuwaEvents,
  ...scrapedWuwaHistoryEvents,
  ...getRecurringZZZEndgame(),
  ...getRecurringGenshinEndgame(),
  ...scrapedStarRailEndgame.map(event => ({
    ...event,
    start: event.end === 'Indefinite' ? new Date(event.start) : new Date(event.start),
    end: event.end === 'Indefinite' ? 'Indefinite' as any : new Date(event.end)
  })),
  ...getRecurringWuwaEndgame()
];

// NEW DEDUPLICATION LOGIC: Keep latest occurrence of recurring events
// For events with same normalized title:
// - If start dates are within 24 hours: keep the better one (same occurrence, different sources)
// - If start dates are far apart: keep ALL occurrences (recurring event history)
const uniqueEventsMap = new Map<string, Event>();

for (const event of combinedEvents) {
  // Normalize title for comparison (remove colons, extra spaces, special chars, and date suffixes)
  const normalizeTitle = (title: string) => {
    const withoutDate = title.replace(/\s+\d{4}-\d{2}-\d{2}$/g, '');
    return withoutDate.toLowerCase().replace(/[:\-\s]+/g, ' ').trim();
  };
  
  const normalizedTitle = normalizeTitle(event.title);
  
  // Create unique key using normalized title + start date to keep all occurrences
  const startDateKey = new Date(event.start).toISOString().split('T')[0];
  const uniqueKey = `${normalizedTitle}|${startDateKey}`;
  
  const existing = uniqueEventsMap.get(uniqueKey);
  
  if (existing) {
    // Same event on same date - keep the better one based on quality
    const existingHasDateSuffix = /\d{4}-\d{2}-\d{2}$/.test(existing.title);
    const newHasDateSuffix = /\d{4}-\d{2}-\d{2}$/.test(event.title);
    
    // For recurring events (Deadly Assault, Shiyu Defense, The Final Callback), prefer titles WITH date suffixes
    const isRecurringEvent = /^(Deadly Assault|Shiyu Defense|The Final Callback)/i.test(event.title) || 
                            /^(Deadly Assault|Shiyu Defense|The Final Callback)/i.test(existing.title);
    
    if (isRecurringEvent) {
      // Prefer titles WITH date suffixes for recurring events
      if (newHasDateSuffix && !existingHasDateSuffix) {
        uniqueEventsMap.set(uniqueKey, event);
        continue;
      } else if (!newHasDateSuffix && existingHasDateSuffix) {
        continue; // Keep existing
      }
    } else {
      // For non-recurring events, prefer titles without date suffixes
      if (!newHasDateSuffix && existingHasDateSuffix) {
        uniqueEventsMap.set(uniqueKey, event);
        continue;
      } else if (newHasDateSuffix && !existingHasDateSuffix) {
        continue; // Keep existing
      }
    }

    // Count special characters (colons, smart quotes) — more = more accurate title
    const specialCharScore = (title: string) => (title.match(/[:!\u2018\u2019\u201c\u201d]/g) || []).length;
    const existingScore = specialCharScore(existing.title);
    const newScore = specialCharScore(event.title);

    // Pick winner: prefer special chars in title, then earlier end time, then real description
    let winner: Event | null = null;

    if (newScore !== existingScore) {
      winner = newScore > existingScore ? event : existing;
    } else {
      // Same special char score — prefer the one ending sooner (more accurate live countdown)
      const existingEnd = existing.end instanceof Date ? existing.end.getTime() : Infinity;
      const newEnd = event.end instanceof Date ? (event.end as Date).getTime() : Infinity;
      if (newEnd !== existingEnd) {
        winner = newEnd < existingEnd ? event : existing;
      }
    }

    if (winner) {
      // Merge: take winner's title+times, but carry over real description/image from loser if winner lacks them
      const loser = winner === event ? existing : event;
      const merged = { ...winner };
      const isPlaceholder = (d?: string) => !d || d.trim() === 'Event details coming soon.' || d.includes('Historical event.');
      if (isPlaceholder(merged.description) && !isPlaceholder(loser.description)) {
        merged.description = loser.description;
      }
      if (!merged.image && loser.image) {
        merged.image = loser.image;
      }
      uniqueEventsMap.set(uniqueKey, merged);
      continue;
    }
    
    // Prefer better descriptions
    const existingIsBad = existing.description?.includes('Historical event.') || 
                          existing.description?.includes('There is currently no text in this page');
    const newIsBad = event.description?.includes('Historical event.') || 
                     event.description?.includes('There is currently no text in this page');
    
    // Prefer events with timezone field (more accurate)
    const existingHasTimezone = !!(existing as any).timezone;
    const newHasTimezone = !!(event as any).timezone;
    if (newHasTimezone && !existingHasTimezone) {
      uniqueEventsMap.set(uniqueKey, event);
      continue;
    } else if (!newHasTimezone && existingHasTimezone) {
      continue; // Keep existing
    }
    
    if (!newIsBad && existingIsBad) {
      uniqueEventsMap.set(uniqueKey, event);
    }
    // Otherwise keep existing (first good one wins)
  } else {
    // First occurrence of this event on this date
    uniqueEventsMap.set(uniqueKey, event);
  }
}

const allEventsArray = Array.from(uniqueEventsMap.values());

// Export all events (including Star Rail endgame for the endgame card)
export const allEvents: Event[] = allEventsArray;

// Filter out Star Rail and Wuwa endgame content from calendar events
const starRailEndgameKeywords = ['memory of chaos', 'pure fiction', 'apocalyptic shadow', 'anomaly arbitration'];
const wuwaEndgameKeywords = ['tower of adversity', 'fantasies of the thousand gateways', 'whimpering wastes', 'doubled pawns'];

export const events: Event[] = allEventsArray.filter(event => {
  // Exclude Star Rail endgame content from calendar
  if (event.game === 'Star Rail') {
    const title = event.title.toLowerCase();
    const isEndgame = starRailEndgameKeywords.some(keyword => title.includes(keyword));
    if (isEndgame) return false;
  }
  
  // Exclude Wuthering Waves endgame content from calendar
  if (event.game === 'Wuthering Waves') {
    const title = event.title.toLowerCase();
    const isEndgame = wuwaEndgameKeywords.some(keyword => title.includes(keyword));
    if (isEndgame) return false;
  }
  
  return true;
});

export type { Event };

type Props = {
  onSelectEvent?: (event: Event) => void;
  onShowMore?: (date: Date, events: Event[]) => void;
  hiddenGames?: Set<string>;
  hideEndedEvents?: boolean;
};

export default function GameCalendar({ onSelectEvent, onShowMore, hiddenGames, hideEndedEvents }: Props) {
  // Filter out hidden games and optionally ended events
  let visibleEvents = hiddenGames 
    ? events.filter(ev => !hiddenGames.has(ev.game || ''))
    : events;
  
  // Filter out ended events if hideEndedEvents is true
  if (hideEndedEvents) {
    const now = new Date();
    visibleEvents = visibleEvents.filter(ev => new Date(ev.end) >= now);
  }
  
  return (
    <div style={{ height: '100%', width: '100%', overflow: 'visible' }}>
      <CustomCalendar 
        events={visibleEvents} 
        onSelectEvent={onSelectEvent} 
        onShowMore={onShowMore}
      />
    </div>
  );
}