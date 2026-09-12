// Recurring Wuthering Waves Endgame Content
// Tower of Adversity resets every 28 days
// Fantasies of the Thousand Gateways resets every Monday at 04:00 AM

import { scrapedWuwaBanners } from './scrapedWuwaBanners';

export function getRecurringWuwaEndgame() {
  const events = [];
  const now = new Date();
  
  // Find the 2nd phase banner end date (banners are sorted, 2nd phase starts after 1st phase)
  // Get all unique end dates and find the latest one that's in the future
  // Filter out TBA dates before processing
  const bannerEndDates = [...new Set(
    scrapedWuwaBanners
      .filter(b => b.end !== 'TBA' && typeof b.end !== 'string')
      .map(b => b.end.getTime())
  )].sort((a, b) => b - a);
  const secondPhaseBannerEnd = bannerEndDates.length > 0 ? new Date(bannerEndDates[0]) : null;
  
  // Define endgame modes with their reset patterns
  const modes = [
    {
      title: 'Tower of Adversity',
      lastReset: '2026-03-02T04:00:00',
      cycleDays: 28, // Resets every 28 days
      durationDays: 28, // Active for 28 days
      image: '/images/wuthering-waves/events/tower-of-adversity.png',
      description: 'Tower of Adversity is a recurring endgame challenge in Wuthering Waves. The Hazard Zone resets every 28 days. Complete challenging floors to earn rewards. Resets at 04:00 AM server time.',
      url: 'https://wutheringwaves.fandom.com/wiki/Tower_of_Adversity'
    },
    {
      title: 'Fantasies of the Thousand Gateways',
      lastReset: '2026-02-17T04:00:00', // Last Monday
      cycleDays: 7, // Resets every week (Monday)
      durationDays: 6, // Active for 6 days (7 days minus 1)
      image: '/images/wuthering-waves/events/fantasies-of-the-thousand-gateways.webp',
      description: 'Fantasies of the Thousand Gateways is a weekly recurring endgame challenge in Wuthering Waves. Complete stages to earn rewards. Resets every Monday at 04:00 AM server time.',
      url: 'https://wutheringwaves.fandom.com/wiki/Fantasies_of_the_Thousand_Gateways'
    },
    {
      title: 'Whimpering Wastes',
      lastReset: '2026-02-16T04:00:00',
      cycleDays: 28, // Resets approximately every 4 weeks (28 days)
      durationDays: 28, // Active for 28 days
      image: '/images/wuthering-waves/events/whimpering-wastes.webp',
      description: 'Whimpering Wastes is a monthly recurring endgame challenge in Wuthering Waves. The "Respawning Waters" portion resets approximately every 4 weeks. Current cycle: Feb 16, 2026 → Mar 16, 2026. Complete challenges to earn rewards. Resets at 04:00 AM server time.',
      url: 'https://wutheringwaves.fandom.com/wiki/Whimpering_Wastes'
    }
  ];
  
  // Add Doubled Pawns Matrix: Pilot if we have banner data
  if (secondPhaseBannerEnd) {
    // Find the earliest banner start date for this patch
    // Filter out TBA dates before processing
    const bannerStartDates = [...new Set(
      scrapedWuwaBanners
        .filter(b => b.start !== 'TBA' && typeof b.start !== 'string')
        .map(b => b.start.getTime())
    )].sort((a, b) => a - b);
    const patchStart = bannerStartDates.length > 0 ? new Date(bannerStartDates[0]) : null;
    
    if (patchStart) {
      // Add 18 hours to the banner end date for Doubled Pawns Matrix end time
      const doubledPawnsEnd = new Date(secondPhaseBannerEnd);
      doubledPawnsEnd.setHours(doubledPawnsEnd.getHours() + 18);
      
      // Format dates for description
      const endDateStr = `${doubledPawnsEnd.getFullYear()}-${String(doubledPawnsEnd.getMonth() + 1).padStart(2, '0')}-${String(doubledPawnsEnd.getDate()).padStart(2, '0')} ${String(doubledPawnsEnd.getHours()).padStart(2, '0')}:${String(doubledPawnsEnd.getMinutes()).padStart(2, '0')}`;
      
      events.push({
        title: 'Doubled Pawns Matrix: Pilot',
        start: patchStart,
        end: doubledPawnsEnd,
        image: '/images/wuthering-waves/events/doubled-pawns-matrix-pilot.jpg',
        description: `Doubled Pawns Matrix: Pilot is a recurring endgame mode in Wuthering Waves. This mode runs until the end of the current patch's 2nd-phase banner maintenance. Target reset: ${endDateStr} UTC+8. Complete challenges to earn rewards.`,
        game: 'Wuthering Waves',
        url: 'https://wutheringwaves.fandom.com/wiki/Doubled_Pawns_Matrix'
      });
    }
  }
  
  // Generate cycles for regular modes
  modes.forEach(mode => {
    const lastResetDate = new Date(mode.lastReset);
    
    // Calculate how many cycles have passed since the last reset
    const daysSinceLastReset = Math.floor((now - lastResetDate) / (24 * 60 * 60 * 1000));
    const cyclesSinceLastReset = Math.floor(daysSinceLastReset / mode.cycleDays);
    
    // Generate 4 cycles (current + 3 future)
    for (let cycle = 0; cycle < 4; cycle++) {
      // Parse the date string components
      const [datePart, timePart] = mode.lastReset.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      
      // Calculate the new date by adding days
      const totalDaysToAdd = (cyclesSinceLastReset + cycle) * mode.cycleDays;
      const startDate = new Date(year, month - 1, day + totalDaysToAdd, hour, minute, 0);
      
      // Format start date as string
      const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}T${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}:00`;
      
      // Calculate end date
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + mode.durationDays);
      
      // Format end date as string
      const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}:00`;
      
      events.push({
        title: mode.title,
        start: new Date(startStr),
        end: new Date(endStr),
        image: mode.image,
        description: mode.description,
        game: 'Wuthering Waves',
        url: mode.url
      });
    }
  });
  
  return events;
}
