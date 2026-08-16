// recurringGenshinEndgame.js
// Recurring Genshin Impact endgame content

/**
 * Get the current Spiral Abyss cycle
 * Resets on the 1st and 16th of every month at 4:00 AM
 * Each cycle lasts until the next reset (approximately 15 days or until month end)
 */
function getSpiralAbyssCycle() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const hour = now.getHours();
  
  let startDay, endDay, endMonth, endYear;
  
  // Determine which half of the month we're in
  if (day < 16 || (day === 16 && hour < 4)) {
    // First half: 1st to 16th (ends at 16th 04:00)
    startDay = 1;
    endDay = 16;
    endMonth = month;
    endYear = year;
  } else {
    // Second half: 16th to 16th of next month (ends at 16th 04:00 of next month)
    startDay = 16;
    endDay = 16;
    endMonth = month + 1;
    endYear = year;
    
    // Handle year rollover
    if (endMonth > 11) {
      endMonth = 0;
      endYear = year + 1;
    }
  }
  
  const start = new Date(year, month, startDay, 4, 0, 0);
  const end = new Date(endYear, endMonth, endDay, 4, 0, 0);
  
  return { start, end };
}

/**
 * Get the current Imaginarium Theater cycle
 * Resets on the 1st of every month at 4:00 AM
 */
function getImaginariumTheaterCycle() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const hour = now.getHours();
  
  let startMonth, endMonth;
  
  // If it's before the 1st at 4:00 AM, we're still in the previous cycle
  if (day === 1 && hour < 4) {
    startMonth = month - 1;
    endMonth = month;
  } else {
    startMonth = month;
    endMonth = month + 1;
  }
  
  const start = new Date(year, startMonth, 1, 4, 0, 0);
  const end = new Date(year, endMonth, 1, 4, 0, 0);
  
  return { start, end };
}

/**
 * Generate recurring Genshin Impact endgame events
 */
export function getRecurringGenshinEndgame() {
  const spiralAbyss = getSpiralAbyssCycle();
  const imaginariumTheater = getImaginariumTheaterCycle();

  // For Spiral Abyss wiki URL: use the 16th of the period
  // Periods run from 16th to 15th of next month
  // Example: Feb 16 - Mar 15, Mar 16 - Apr 15, etc.
  const now = new Date();
  const day = now.getDate();
  const hour = now.getHours();

  let wikiYear, wikiMonth;

  if (day >= 16 || (day === 16 && hour >= 4)) {
    // We're past the 16th, so use current month's 16th
    wikiYear = now.getFullYear();
    wikiMonth = now.getMonth();
  } else {
    // We're before the 16th, so use previous month's 16th
    wikiYear = now.getFullYear();
    wikiMonth = now.getMonth() - 1;

    // Handle year rollover
    if (wikiMonth < 0) {
      wikiMonth = 11;
      wikiYear--;
    }
  }

  const spiralAbyssDate = `${wikiYear}-${String(wikiMonth + 1).padStart(2, '0')}-16`;

  return [
    {
      title: 'Spiral Abyss',
      start: spiralAbyss.start,
      end: spiralAbyss.end,
      image: '/images/genshin-impact/events/spiral-abyss.png',
      description: 'Spiral Abyss is a recurring endgame domain in Genshin Impact that resets twice monthly on the 1st and 16th at 4:00 AM server time.',
      game: 'Genshin Impact',
      wikiUrl: `https://genshin-impact.fandom.com/wiki/Spiral_Abyss/Floors/${spiralAbyssDate}`,
    },
    {
      title: 'Imaginarium Theater',
      start: imaginariumTheater.start,
      end: imaginariumTheater.end,
      image: '/images/genshin-impact/events/imaginarium-theater.png',
      description: 'Imaginarium Theater is a monthly endgame mode in Genshin Impact that resets on the 1st of every month at 4:00 AM server time.',
      game: 'Genshin Impact',
    }
  ];
}
