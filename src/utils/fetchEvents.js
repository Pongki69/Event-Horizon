// fetchEvents.js
// Utility to fetch and parse Genshin Impact events from the wiki

/**
 * Fetches events from Genshin Impact Wiki
 * Note: Direct fetching may be blocked by CORS. Consider using a backend proxy.
 */
export async function fetchGenshinEvents() {
  try {
    // Using a CORS proxy to bypass restrictions
    const proxyUrl = 'https://api.allorigins.win/raw?url=';
    const targetUrl = encodeURIComponent('https://genshin-impact.fandom.com/wiki/Genshin_Impact_Wiki');
    
    const response = await fetch(proxyUrl + targetUrl);
    const html = await response.text();
    
    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find the events gallery section
    const eventsGallery = doc.querySelector('.Mainpage-border.events-gallery');
    
    if (!eventsGallery) {
      console.warn('Events gallery not found, using fallback data');
      return getFallbackEvents();
    }
    
    const events = [];
    
    // Find all gallery items
    const galleryItems = eventsGallery.querySelectorAll('.wikia-gallery-item');
    
    galleryItems.forEach(item => {
      try {
        // Get image
        const img = item.querySelector('img');
        const imageUrl = img?.getAttribute('data-src') || img?.getAttribute('src') || '';
        
        // Get title from alt text
        const title = img?.getAttribute('alt') || 'Untitled Event';
        
        // Get caption with dates
        const caption = item.querySelector('.lightbox-caption');
        const captionText = caption?.textContent?.trim() || '';
        
        // Parse dates from caption (format: "From Month Day, Year to Month Day, Year")
        const dateMatch = captionText.match(/From\s+(\w+)\s+(\d+),\s+(\d+)\s+to\s+(\w+)\s+(\d+),\s+(\d+)/i);
        
        let startDate = new Date();
        let endDate = new Date();
        
        if (dateMatch) {
          const [, startMonth, startDay, startYear, endMonth, endDay, endYear] = dateMatch;
          startDate = parseDate(startMonth, startDay, startYear);
          endDate = parseDate(endMonth, endDay, endYear);
        }
        
        events.push({
          title: title,
          start: startDate,
          end: endDate,
          image: imageUrl.startsWith('http') ? imageUrl : `https:${imageUrl}`,
          description: captionText,
        });
      } catch (error) {
        console.error('Error parsing event item:', error);
      }
    });
    
    return events.length > 0 ? events : getFallbackEvents();
    
  } catch (error) {
    console.error('Error fetching events:', error);
    return getFallbackEvents();
  }
}

/**
 * Parse month name to month index (0-11)
 */
function parseDate(monthName, day, year) {
  const months = {
    'january': 0, 'february': 1, 'march': 2, 'april': 3,
    'may': 4, 'june': 5, 'july': 6, 'august': 7,
    'september': 8, 'october': 9, 'november': 10, 'december': 11
  };
  
  const monthIndex = months[monthName.toLowerCase()] || 0;
  return new Date(parseInt(year), monthIndex, parseInt(day));
}

/**
 * Fallback events data when fetching fails
 */
function getFallbackEvents() {
  return [
    {
      title: 'Lantern Rite',
      start: new Date(2026, 1, 3),
      end: new Date(2026, 1, 24),
      image: 'https://static.wikia.nocookie.net/gensin-impact/images/thumb/e/e0/Event_Lantern_Rite_2024.png/500px-Event_Lantern_Rite_2024.png',
      description: 'From February 03, 2026 to February 24, 2026 - Celebrate the Lantern Rite festival in Liyue.',
    },
    {
      title: 'Spiral Abyss',
      start: new Date(2026, 1, 16),
      end: new Date(2026, 1, 23),
      image: 'https://static.wikia.nocookie.net/gensin-impact/images/thumb/8/8f/Domain_Spiral_Abyss.png/500px-Domain_Spiral_Abyss.png',
      description: 'From February 16, 2026 to February 23, 2026 - Challenge the Spiral Abyss for rewards.',
    },
    {
      title: 'Stellar Reunion',
      start: new Date(2026, 1, 9),
      end: new Date(2026, 1, 23),
      image: 'https://static.wikia.nocookie.net/gensin-impact/images/thumb/5/5e/Event_Stellar_Reunion.png/500px-Event_Stellar_Reunion.png',
      description: 'From February 09, 2026 to February 23, 2026 - Welcome back rewards for returning players.',
    },
    {
      title: 'Character Banner',
      start: new Date(2026, 1, 3),
      end: new Date(2026, 1, 24),
      image: 'https://static.wikia.nocookie.net/gensin-impact/images/thumb/c/c7/Wish_Epitome_Invocation_2024-02-06.png/500px-Wish_Epitome_Invocation_2024-02-06.png',
      description: 'From February 03, 2026 to February 24, 2026 - Limited character wish banner.',
    },
    {
      title: 'Weapon Banner',
      start: new Date(2026, 1, 3),
      end: new Date(2026, 1, 24),
      image: 'https://static.wikia.nocookie.net/gensin-impact/images/thumb/8/8c/Wish_Epitome_Invocation_2024-01-31.png/500px-Wish_Epitome_Invocation_2024-01-31.png',
      description: 'From February 03, 2026 to February 24, 2026 - Limited weapon wish banner.',
    },
  ];
}
