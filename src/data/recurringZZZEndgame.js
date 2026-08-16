// recurringZZZEndgame.js
// Recurring ZZZ endgame content that resets weekly

/**
 * Get the next Monday at 4:00 AM from a given date
 */
function getNextMonday4AM(fromDate = new Date()) {
  const date = new Date(fromDate);
  const dayOfWeek = date.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
  
  date.setDate(date.getDate() + daysUntilMonday);
  date.setHours(4, 0, 0, 0);
  
  return date;
}

/**
 * Get the current week's Monday at 4:00 AM (start of current cycle)
 */
function getCurrentMonday4AM(fromDate = new Date()) {
  const date = new Date(fromDate);
  const dayOfWeek = date.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  date.setDate(date.getDate() - daysToSubtract);
  date.setHours(4, 0, 0, 0);
  
  return date;
}

/**
 * Generate recurring ZZZ endgame events
 * These reset every Monday at 4:00 AM
 */
export function getRecurringZZZEndgame() {
  const now = new Date();
  const currentStart = getCurrentMonday4AM(now);
  const currentEnd = getNextMonday4AM(now);
  
  return [
    {
      title: 'Lost Void',
      start: currentStart,
      end: currentEnd,
      image: '/images/zenless-zone-zero/events/lost-void.webp',
      description: 'Lost Void is a weekly endgame mode in Zenless Zone Zero that resets every Monday at 4:00 AM.',
      game: 'Zenless Zone Zero',
    },
    {
      title: 'Withered Domain',
      start: currentStart,
      end: currentEnd,
      image: '/images/zenless-zone-zero/events/withered-domain.webp',
      description: 'Withered Domain is a weekly endgame mode in Zenless Zone Zero that resets every Monday at 4:00 AM.',
      game: 'Zenless Zone Zero',
    }
  ];
}
