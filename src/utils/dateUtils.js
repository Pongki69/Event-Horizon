// dateUtils.js
// Utility functions for date handling
// Note: Dates are stored with their original timezone, need to convert based on timezone field

/**
 * Convert stored date to UTC+8 for comparison
 * @param {Date} storedDate - The date stored from wiki
 * @param {string} timezone - The timezone of the stored date (e.g., 'UTC+8', 'UTC-8', 'GMT+8')
 * @returns {Date} - The date adjusted to UTC+8 for comparison
 */
const convertStoredDateToUTC8 = (storedDate, timezone = 'UTC+8') => {
  // Handle Indefinite dates - return far future date
  if (storedDate === 'Indefinite' || (typeof storedDate === 'string' && storedDate === 'Indefinite')) {
    return new Date('2099-12-31T23:59:59.999Z');
  }
  
  // Handle TBA dates - return far future date
  if (storedDate === 'TBA' || (typeof storedDate === 'string' && storedDate === 'TBA')) {
    return new Date('2099-12-31T23:59:59.999Z');
  }
  
  const date = new Date(storedDate);
  
  // If already UTC+8 or GMT+8 or Server Time, no adjustment needed
  if (timezone === 'UTC+8' || timezone === 'GMT+8' || timezone === 'Server Time') {
    return date;
  }
  
  // Parse timezone offset
  const match = timezone.match(/UTC([+-])(\d+)/i);
  if (match) {
    const sign = match[1];
    const offset = parseInt(match[2]);
    const actualOffset = sign === '+' ? offset : -offset;
    
    // Calculate hours to add to convert to UTC+8
    // If stored in UTC-8, need to add 16 hours to get to UTC+8
    const hoursToAdd = 8 - actualOffset;
    
    return new Date(date.getTime() + (hoursToAdd * 60 * 60 * 1000));
  }
  
  // Default: assume UTC+8
  return date;
};

// Format date for display
export const formatAsiaDate = (date, formatStr = 'MMMM d, yyyy') => {
  // Handle "Indefinite" dates
  if (date === 'Indefinite' || (typeof date === 'string' && date === 'Indefinite')) {
    return 'Indefinite';
  }
  
  // Handle "TBA" dates
  if (date === 'TBA' || (typeof date === 'string' && date === 'TBA')) {
    return 'TBA';
  }
  
  const dateObj = new Date(date);
  
  // Check if date is invalid - return TBA for invalid dates
  if (isNaN(dateObj.getTime())) {
    return 'TBA';
  }

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  
  // Convert to UTC+8 for display
  const utc8Date = new Date(dateObj.getTime() + (8 * 60 * 60 * 1000));
  const month = months[utc8Date.getUTCMonth()];
  const day = utc8Date.getUTCDate();
  const year = utc8Date.getUTCFullYear();

  return `${month} ${day}, ${year}`;
};

// Get countdown - dates stored as wiki date/time directly, compare against now
export const getCountdownAsia = (endDate, timezone = 'UTC+8') => {
  const now = new Date();
  const endUTC8 = convertStoredDateToUTC8(endDate, timezone);
  const diff = endUTC8 - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { days, hours, minutes, seconds };
};

// Get time until start - dates stored as wiki date/time directly, compare against now
export const getTimeUntilStartAsia = (startDate, timezone = 'UTC+8') => {
  const now = new Date();
  const startUTC8 = convertStoredDateToUTC8(startDate, timezone);
  const diff = startUTC8 - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { days, hours, minutes, seconds };
};

// Check if event is active
export const isEventActiveAsia = (startDate, endDate, timezone = 'UTC+8') => {
  if (endDate === 'Indefinite') {
    const now = new Date();
    const startUTC8 = convertStoredDateToUTC8(startDate, timezone);
    return startUTC8 <= now;
  }
  const now = new Date();
  const startUTC8 = convertStoredDateToUTC8(startDate, timezone);
  const endUTC8 = convertStoredDateToUTC8(endDate, timezone);
  return startUTC8 <= now && endUTC8 > now;
};

// Check if event is upcoming
export const isEventUpcomingAsia = (startDate, timezone = 'UTC+8') => {
  const now = new Date();
  const startUTC8 = convertStoredDateToUTC8(startDate, timezone);
  return startUTC8 > now;
};

// Check if event has ended
export const isEventEndedAsia = (endDate, timezone = 'UTC+8') => {
  const now = new Date();
  const endUTC8 = convertStoredDateToUTC8(endDate, timezone);
  return endUTC8 <= now;
};
