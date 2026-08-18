// App.jsx
// Main app container. Uses events exported from GameCalendar so lists and calendar share the same source.
// - Left sidebar lists are populated from the shared `events` array.
// - Clicking a list item opens that event in the right details panel.

import './App.css';
import GameCalendar, { allEvents as sharedEvents } from './components/GameCalendar';
import WelcomePage from './components/WelcomePage';
import LoadingScreen from './components/LoadingScreen';
import EmptyState from './components/EmptyState';
import DonateModal from './components/DonateModal';
import Tooltip from './components/Tooltip';
import EventCard from './components/EventCard';
import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { formatAsiaDate, isEventActiveAsia, isEventUpcomingAsia, isEventEndedAsia } from './utils/dateUtils';
import CountdownBadge from './components/CountdownBadge';
import VisitorCounter from './components/VisitorCounter';

// Lazy load EventTable component (only loaded when switching to table view)
const EventTable = lazy(() => import('./components/EventTable'));

// Lazy load banner data (only loaded when needed)
const loadBanners = async () => {
  const [genshin, starRail, zzz, wuwa] = await Promise.all([
    import('./data/scrapedGenshinBanners'),
    import('./data/scrapedStarRailBanners'),
    import('./data/scrapedZZZBanners'),
    import('./data/scrapedWuwaBanners')
  ]);
  
  return [
    ...genshin.scrapedGenshinBanners,
    ...starRail.scrapedStarRailBanners,
    ...zzz.scrapedZZZBanners,
    ...wuwa.scrapedWuwaBanners
  ];
};

// Simple date formatter used throughout the details and lists (now uses Asia timezone)
const fmtDate = (d) => formatAsiaDate(new Date(d));

// Helper function to format game name for display
const formatGameName = (game) => {
  if (game === 'Star Rail') {
    return 'Honkai: Star Rail';
  }
  return game;
};

// Helper function to generate wiki URL from event title and game
const getWikiUrl = (event) => {
  // If event has a stored wikiUrl, use that
  if (event.wikiUrl) {
    return event.wikiUrl;
  }
  
  // Otherwise, generate from title and game
  const wikiTitle = event.title.replace(/\s+/g, '_');
  
  if (event.game === 'Genshin Impact') {
    return `https://genshin-impact.fandom.com/wiki/${encodeURIComponent(wikiTitle)}`;
  } else if (event.game === 'Honkai: Star Rail' || event.game === 'Star Rail') {
    return `https://honkai-star-rail.fandom.com/wiki/${encodeURIComponent(wikiTitle)}`;
  } else if (event.game === 'Zenless Zone Zero') {
    return `https://zenless-zone-zero.fandom.com/wiki/${encodeURIComponent(wikiTitle)}`;
  } else if (event.game === 'Wuthering Waves') {
    return `https://wutheringwaves.fandom.com/wiki/${encodeURIComponent(wikiTitle)}`;
  }
  
  return null;
};

function App() {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showMore, setShowMore] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    const saved = localStorage.getItem('showWelcome');
    return saved !== 'false'; // Show welcome unless user has explicitly dismissed it
  });
  
  // Lazy load banners
  const [allBanners, setAllBanners] = useState([]);
  const [bannersLoaded, setBannersLoaded] = useState(false);
  
  // Load hidden games from localStorage on mount
  const [hiddenGames, setHiddenGames] = useState(() => {
    const saved = localStorage.getItem('hiddenGames');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  
  // Load hideEndedEvents from localStorage on mount
  const [hideEndedEvents, setHideEndedEvents] = useState(() => {
    const saved = localStorage.getItem('hideEndedEvents');
    return saved ? JSON.parse(saved) : false;
  });
  
  // Load hidePermanentEvents from localStorage on mount
  const [hidePermanentEvents, setHidePermanentEvents] = useState(() => {
    const saved = localStorage.getItem('hidePermanentEvents');
    return saved ? JSON.parse(saved) : false;
  });
  
  // Hide ended events in event details card only (not persisted)
  const [hideEndedInDetails, setHideEndedInDetails] = useState(false);
  
  // Mobile: Hide calendar/table view (only on mobile)
  const [hideCalendarTable, setHideCalendarTable] = useState(() => {
    const saved = localStorage.getItem('hideCalendarTable');
    return saved ? JSON.parse(saved) : false;
  });
  
  // Navigation menu state for mobile
  const [showNavMenu, setShowNavMenu] = useState(false);
  
  // View mode: 'calendar' or 'table'
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem('viewMode');
    return saved || 'calendar';
  });
  
  // Donate modal state
  const [showDonateModal, setShowDonateModal] = useState(false);
  
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1920);

  // Track window width for responsive countdown formatting - DEBOUNCED
  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setWindowWidth(window.innerWidth);
      }, 150); // Debounce resize events
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Save hidden games to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('hiddenGames', JSON.stringify([...hiddenGames]));
  }, [hiddenGames]);
  
  // Save hideEndedEvents to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('hideEndedEvents', JSON.stringify(hideEndedEvents));
  }, [hideEndedEvents]);
  
  // Save hidePermanentEvents to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('hidePermanentEvents', JSON.stringify(hidePermanentEvents));
  }, [hidePermanentEvents]);
  
  // Save hideCalendarTable to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('hideCalendarTable', JSON.stringify(hideCalendarTable));
  }, [hideCalendarTable]);
  
  // Save viewMode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('viewMode', viewMode);
  }, [viewMode]);
  
  // Lazy load banners when not on welcome page
  useEffect(() => {
    if (!showWelcome && !bannersLoaded) {
      loadBanners().then(banners => {
        setAllBanners(banners);
        setBannersLoaded(true);
      });
    }
  }, [showWelcome, bannersLoaded]);

  const toggleGame = useCallback((gameName) => {
    setHiddenGames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(gameName)) {
        newSet.delete(gameName);
      } else {
        newSet.add(gameName);
      }
      return newSet;
    });
  }, []);

  const handleEventSelect = useCallback((event) => {
    setSelectedEvent(event);
    setShowMore(null);
    
    // Scroll to event details section after state updates
    setTimeout(() => {
      const detailsCard = document.getElementById('event-details-section') || 
                         document.querySelector('.details-card');
      
      if (detailsCard) {
        detailsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  }, []);

  const handleShowMore = useCallback((date, events) => {
    // Sort events by end date (ending soonest first)
    const sortedEvents = [...events].sort((a, b) => new Date(a.end) - new Date(b.end));
    setShowMore({ date, events: sortedEvents });
    setSelectedEvent(null);
    
    // Scroll to event details section after state updates
    setTimeout(() => {
      const detailsCard = document.getElementById('event-details-section') || 
                         document.querySelector('.details-card');
      
      if (detailsCard) {
        detailsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEvent(null);
    setShowMore(null);
  }, []);

  const selectFromShowMore = useCallback((event) => {
    setSelectedEvent(event);
    setShowMore(null);
  }, []);
  
  // Scroll to section
  const scrollToSection = useCallback((sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setShowNavMenu(false);
    }
  }, []);

  // For the sidebar cards:
  // - Limited Events: show only events that have started but not ended (current events), sorted by end date (ending soonest first)
  // - Upcoming Events: show only future events (events that haven't started yet), sorted by end date
  // Filter out hidden games and use Asia timezone for filtering
  // Memoize to avoid recalculating on every render
  const visibleEvents = useMemo(() => 
    sharedEvents.filter(ev => {
      if (hiddenGames.has(ev.game)) return false;
      if (hidePermanentEvents && ev.endNote === 'Permanent') return false;
      return true;
    }),
    [hiddenGames, hidePermanentEvents]
  );
  
  // Endgame Content: recurring endgame activities (Abyss, Theater, etc.) - only active/upcoming
  const endgameKeywords = ['abyss', 'theater', 'spiral', 'memory of chaos', 'pure fiction', 'apocalyptic shadow', 'anomaly arbitration', 'currency wars', 'divergent universe', 'shiyu defense', 'tower', 'illusive realm', 'deadly assault', 'lost void', 'withered domain', 'stygian onslaught', 'fantasies of the thousand gateways', 'whimpering wastes', 'doubled pawns'];
  
  const limited = useMemo(() => 
    visibleEvents
      .filter(ev => {
        const title = ev.title.toLowerCase();
        const isEndgame = endgameKeywords.some(keyword => title.includes(keyword));
        return isEventActiveAsia(ev.start, ev.end, ev.timezone || 'UTC+8') && ev.endNote !== 'Permanent' && !isEndgame;
      })
      .sort((a, b) => new Date(a.end) - new Date(b.end)),
    [visibleEvents]
  );
  
  const endgame = useMemo(() => {
    const filtered = visibleEvents
      .filter(ev => {
        const title = ev.title.toLowerCase();
        const hasKeyword = endgameKeywords.some(keyword => title.includes(keyword));
        const isActive = isEventActiveAsia(ev.start, ev.end, ev.timezone || 'UTC+8');
        return hasKeyword && isActive;
      })
      .sort((a, b) => {
        // Handle indefinite events - put them at the end
        const aIsIndefinite = a.end === 'Indefinite' || a.endNote === 'Permanent';
        const bIsIndefinite = b.end === 'Indefinite' || b.endNote === 'Permanent';
        
        if (aIsIndefinite && !bIsIndefinite) return 1; // a goes after b
        if (!aIsIndefinite && bIsIndefinite) return -1; // a goes before b
        if (aIsIndefinite && bIsIndefinite) return 0; // keep original order
        
        // Both have real end dates - sort by end date (ending soonest first)
        return new Date(a.end) - new Date(b.end);
      });
    
    // Remove duplicates by title, keeping the one ending soonest (already sorted)
    const uniqueMap = new Map();
    for (const ev of filtered) {
      if (!uniqueMap.has(ev.title)) {
        uniqueMap.set(ev.title, ev);
      }
    }
    
    return Array.from(uniqueMap.values());
  }, [visibleEvents]);
  
  const permanent = useMemo(() => 
    visibleEvents
      .filter(ev => ev.endNote === 'Permanent')
      .sort((a, b) => new Date(b.start) - new Date(a.start)),
    [visibleEvents]
  );
  
  const upcoming = useMemo(() => 
    visibleEvents
      .filter(ev => {
        const title = ev.title.toLowerCase();
        const isEndgame = endgameKeywords.some(keyword => title.includes(keyword));
        return isEventUpcomingAsia(ev.start, ev.timezone || 'UTC+8') && !isEndgame;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start)),
    [visibleEvents]
  );

  // Determine if we should use short countdown format (for smaller screens)
  const useShortFormat = useMemo(() => windowWidth < 1270, [windowWidth]);
  
  // Memoize filtered banners
  const activeBanners = useMemo(() => 
    allBanners
      .filter(banner => !hiddenGames.has(banner.game || ''))
      .filter(banner => isEventActiveAsia(banner.start, banner.end, banner.timezone || 'UTC+8')),
    [hiddenGames, allBanners]
  );
  
  const upcomingBanners = useMemo(() => 
    allBanners
      .filter(banner => !hiddenGames.has(banner.game || ''))
      .filter(banner => isEventUpcomingAsia(banner.start, banner.timezone || 'UTC+8')),
    [hiddenGames, allBanners]
  );

  const handleGetStarted = useCallback(() => {
    setIsLoading(true);
    localStorage.setItem('showWelcome', 'false'); // Save that we're on the main app
    setTimeout(() => {
      setShowWelcome(false);
      setIsLoading(false);
    }, 1500);
  }, []);

  const handleLogoClick = useCallback(() => {
    setShowWelcome(true);
    localStorage.setItem('showWelcome', 'true'); // Save that we're on welcome page
    setSelectedEvent(null);
    setShowMore(null);
  }, []);

  // Simulate initial loading
  useEffect(() => {
    if (!showWelcome && isLoading) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [showWelcome, isLoading]);

  // Show loading screen
  if (isLoading && !showWelcome) {
    return <LoadingScreen />;
  }

  // Show welcome page if user hasn't visited before
  if (showWelcome) {
    return <WelcomePage onGetStarted={handleGetStarted} />;
  }

  return (
    <main className="app">
      <header className="app-header">
        <div className="header-title">
          <img 
            src="/favicon.png" 
            alt="Event Horizon Logo" 
            className="header-logo" 
            onClick={handleLogoClick}
            style={{ cursor: 'pointer' }}
            title="Back to Welcome Page"
          />
          <h1>Event Horizon</h1>
        </div>
        
        {/* View Toggle - Centered */}
        <div className="view-toggle">
          <button
            className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Calendar
          </button>
          <button
            className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Table
          </button>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <VisitorCounter />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="back-to-welcome-btn"
              onClick={handleLogoClick}
              title="Back to Welcome Page"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Home
            </button>
            <button 
              className="donate-btn"
              onClick={() => setShowDonateModal(true)}
              title="Support the project"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              Donate
            </button>
          </div>
        </div>
      </header>

      <section className="content">
        <aside className="sidebar">
          <div className="card" id="games-section">
            <h3 className="section-header">
              GAMES
              <Tooltip content="Click to hide/show games. Recommended: Display 2-3 games for best performance.">
                <span 
                  className="info-icon"
                  style={{ 
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    border: '1px solid #6b7280',
                    fontSize: '11px',
                    color: '#6b7280',
                    cursor: 'help',
                    fontWeight: 'bold'
                  }}
                >
                  i
                </span>
              </Tooltip>
            </h3>
            <ul className="legend-list">
              <li 
                onClick={() => toggleGame('Genshin Impact')}
                style={{ 
                  cursor: 'pointer', 
                  textDecoration: hiddenGames.has('Genshin Impact') ? 'line-through' : 'none',
                  opacity: hiddenGames.has('Genshin Impact') ? 0.5 : 1
                }}
              >
                <span className="dot genshin" aria-hidden="true"></span>Genshin Impact
              </li>
              <li 
                onClick={() => toggleGame('Honkai: Star Rail')}
                style={{ 
                  cursor: 'pointer', 
                  textDecoration: hiddenGames.has('Honkai: Star Rail') ? 'line-through' : 'none',
                  opacity: hiddenGames.has('Honkai: Star Rail') ? 0.5 : 1
                }}
              >
                <span className="dot starrail" aria-hidden="true"></span>Honkai: Star Rail
              </li>
              <li 
                onClick={() => toggleGame('Zenless Zone Zero')}
                style={{ 
                  cursor: 'pointer', 
                  textDecoration: hiddenGames.has('Zenless Zone Zero') ? 'line-through' : 'none',
                  opacity: hiddenGames.has('Zenless Zone Zero') ? 0.5 : 1
                }}
              >
                <span className="dot zzz" aria-hidden="true"></span>Zenless Zone Zero
              </li>
              <li 
                onClick={() => toggleGame('Wuthering Waves')}
                style={{ 
                  cursor: 'pointer', 
                  textDecoration: hiddenGames.has('Wuthering Waves') ? 'line-through' : 'none',
                  opacity: hiddenGames.has('Wuthering Waves') ? 0.5 : 1
                }}
              >
                <span className="dot wuthering" aria-hidden="true"></span>Wuthering Waves
              </li>
              <li 
                onClick={() => toggleGame('Arknights: Endfield')}
                style={{ 
                  cursor: 'pointer', 
                  textDecoration: hiddenGames.has('Arknights: Endfield') ? 'line-through' : 'none',
                  opacity: hiddenGames.has('Arknights: Endfield') ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span className="dot arknights" aria-hidden="true"></span>
                <span>Arknights: Endfield</span>
                <Tooltip content="Coming soon! We're working on adding Arknights: Endfield events.">
                  <span 
                    className="info-icon"
                    style={{ 
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: '1px solid #6b7280',
                      fontSize: '11px',
                      color: '#6b7280',
                      cursor: 'help',
                      marginLeft: 'auto',
                      fontWeight: 'bold'
                    }}
                  >
                    i
                  </span>
                </Tooltip>
              </li>
            </ul>
            
            {/* Filter Options */}
            <div style={{ 
              marginTop: '16px', 
              paddingTop: '16px', 
              borderTop: '1px solid rgba(139, 120, 255, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              {/* Mobile-only: Hide Calendar/Table toggle */}
              <label 
                className="mobile-only-filter"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  color: '#d1d5db'
                }}
              >
                <input 
                  type="checkbox" 
                  checked={hideCalendarTable}
                  onChange={(e) => setHideCalendarTable(e.target.checked)}
                  style={{ 
                    cursor: 'pointer',
                    width: '16px',
                    height: '16px',
                    accentColor: '#8b78ff'
                  }}
                />
                Hide Calendar/Table
              </label>
              
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: '#d1d5db'
              }}>
                <input 
                  type="checkbox" 
                  checked={hideEndedEvents}
                  onChange={(e) => setHideEndedEvents(e.target.checked)}
                  style={{ 
                    cursor: 'pointer',
                    width: '16px',
                    height: '16px',
                    accentColor: '#8b78ff'
                  }}
                />
                Hide Ended Events
              </label>
              
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: '#d1d5db'
              }}>
                <input 
                  type="checkbox" 
                  checked={hidePermanentEvents}
                  onChange={(e) => setHidePermanentEvents(e.target.checked)}
                  style={{ 
                    cursor: 'pointer',
                    width: '16px',
                    height: '16px',
                    accentColor: '#8b78ff'
                  }}
                />
                Hide Permanent Events
              </label>
            </div>
          </div>

          {/* Event Status Filters */}
          <div className="card" id="filters-section">
            <h3 className="section-header">
              LIMITED EVENTS ({limited.length})
              <Tooltip content="Currently active events with limited duration.">
                <span className="info-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', border: '1px solid #6b7280', fontSize: '11px', color: '#6b7280', cursor: 'help', fontWeight: 'bold' }}>i</span>
              </Tooltip>
            </h3>
            <div className="media-rows-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {limited.map((ev, i) => (
                <EventCard
                  key={`${ev.title}-${i}`}
                  event={ev}
                  onClick={() => handleEventSelect(ev)}
                  useShortFormat={useShortFormat}
                  isUpcoming={false}
                />
              ))}
              {limited.length === 0 && (
                <EmptyState 
                  icon="📅"
                  title="No Active Events"
                  description="Check back soon for new events!"
                />
              )}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="card" id="upcoming-events-section">
            <h3 className="section-header">
              UPCOMING EVENTS ({upcoming.length})
              <Tooltip content="Events scheduled to start in the future.">
                <span className="info-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', border: '1px solid #6b7280', fontSize: '11px', color: '#6b7280', cursor: 'help', fontWeight: 'bold' }}>i</span>
              </Tooltip>
            </h3>
            <div className="media-rows-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {upcoming.map((ev, i) => (
                <EventCard
                  key={`${ev.title}-${i}`}
                  event={ev}
                  onClick={() => handleEventSelect(ev)}
                  useShortFormat={useShortFormat}
                  isUpcoming={true}
                />
              ))}
              {upcoming.length === 0 && (
                <EmptyState 
                  icon="🔮"
                  title="No Upcoming Events"
                  description="All caught up! No new events scheduled yet."
                />
              )}
            </div>
          </div>

          {/* Endgame Content */}
          <div className="card" id="endgame-content-section">
            <h3 className="section-header">
              ENDGAME CONTENT ({endgame.length})
              <Tooltip content="Recurring endgame activities like Abyss, Theater, and other challenges.">
                <span className="info-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', border: '1px solid #6b7280', fontSize: '11px', color: '#6b7280', cursor: 'help', fontWeight: 'bold' }}>i</span>
              </Tooltip>
            </h3>
            <div className="media-rows-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {endgame.map((ev, i) => (
                <EventCard
                  key={`${ev.title}-${i}`}
                  event={ev}
                  onClick={() => handleEventSelect(ev)}
                  useShortFormat={useShortFormat}
                  isUpcoming={false}
                />
              ))}
              {endgame.length === 0 && (
                <EmptyState 
                  icon="⚔️"
                  title="No Active Endgame"
                  description="Endgame content will appear here when active."
                />
              )}
            </div>
          </div>
        </aside>

        <section className={`calendar-area ${hideCalendarTable ? 'calendar-hidden' : ''}`} id="calendar-section">
          {/* View toggle on top of calendar - only visible on mobile/tablet portrait */}
          <div className="calendar-top-bar">
            <div className="view-toggle view-toggle-mobile" style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                onClick={() => setViewMode('calendar')}
                aria-label="Calendar View"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                Calendar
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                aria-label="Table View"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
                Table
              </button>
            </div>
          </div>

          {/* Render based on view mode */}
          {!hideCalendarTable && (
            <>
              {viewMode === 'calendar' ? (
                <div className="calendar-wrapper">
                  <GameCalendar 
                    onSelectEvent={handleEventSelect} 
                    onShowMore={handleShowMore} 
                    hiddenGames={hiddenGames} 
                    hideEndedEvents={hideEndedEvents}
                  />
                </div>
              ) : (
                <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Loading table view...</div>}>
                  <EventTable onEventClick={handleEventSelect} />
                </Suspense>
              )}
            </>
          )}
        </section>


        <aside className="details-card">
          <div className="card event-detail-card" id="event-details-section">
            {!selectedEvent && !showMore && (
              <>
                <h3 className="section-header">EVENT DETAILS</h3>
                <p className="muted">Click an event on the calendar to view details. Click "+n more" to list all events for that day on this panel.</p>
              </>
            )}

            {selectedEvent && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
                  <h3 style={{ margin: 0, flex: 1 }}>{selectedEvent.title}</h3>

                  <button
                    className="icon-btn"
                    onClick={clearSelection}
                    title="Close"
                    aria-label="Close"
                    style={{ flexShrink: 0 }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6L6 18"></path>
                      <path d="M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>

                <div className="event-detail-content" style={{ maxHeight: '600px', overflowY: 'auto', overflowX: 'hidden' }}>
                  <div style={{ position: 'relative' }} className="event-detail-image-wrapper">
                    <a 
                      href={getWikiUrl(selectedEvent)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      title={`View ${selectedEvent.title} on wiki`}
                      style={{ 
                        display: 'block', 
                        position: 'relative',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    >
                      {selectedEvent.image ? (
                        <img
                          src={selectedEvent.image}
                          alt={selectedEvent.title}
                          className="event-detail-image"
                          loading="lazy"
                          style={{ cursor: 'pointer' }}
                        />
                      ) : (
                        <div 
                          className="event-detail-image"
                          style={{ 
                            cursor: 'pointer',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            padding: '20px',
                            minHeight: '300px'
                          }}
                        >
                          {selectedEvent.title}
                        </div>
                      )}
                      {/* External link icon overlay */}
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'rgba(0, 0, 0, 0.6)',
                        borderRadius: '4px',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <svg 
                          width="16" 
                          height="16" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="white" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </div>
                      </a>
                      <CountdownBadge 
                        endDate={selectedEvent.end}
                        startDate={selectedEvent.start}
                        timezone={selectedEvent.timezone || 'UTC+8'}
                        endNote={selectedEvent.endNote}
                        isUpcoming={isEventUpcomingAsia(selectedEvent.start, selectedEvent.timezone || 'UTC+8')}
                        isEnded={isEventEndedAsia(selectedEvent.end, selectedEvent.timezone || 'UTC+8')}
                        useShortFormat={useShortFormat}
                      />
                    </div>

                  <div className="event-detail-text" style={{ whiteSpace: 'pre-wrap' }}>
                    {/* Event dates */}
                    <div style={{ 
                      marginBottom: '16px', 
                      padding: '12px', 
                      background: 'rgba(139, 120, 255, 0.1)', 
                      borderRadius: '8px',
                      borderLeft: '3px solid #8b78ff'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b78ff" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          <span style={{ fontWeight: '600', color: '#8b78ff' }}>Start:</span>
                          <span style={{ color: '#e5e7eb' }}>{fmtDate(selectedEvent.start)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b78ff" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                          </svg>
                          <span style={{ fontWeight: '600', color: '#8b78ff' }}>End:</span>
                          <span style={{ color: '#e5e7eb' }}>
                            {selectedEvent.endNote === 'Permanent' ? 'Indefinite' : fmtDate(selectedEvent.end)}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Event description */}
                    {selectedEvent.description ? (
                      <p style={{ margin: 0 }}>{selectedEvent.description}</p>
                    ) : (
                      <p style={{ margin: 0 }} className="muted">No additional description available.</p>
                    )}
                  </div>
                </div>
              </>
            )}

            {showMore && (
              <div className="event-detail-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  gap: 12, 
                  marginBottom: 20, 
                  flexShrink: 0, 
                  paddingBottom: 16, 
                  borderBottom: '2px solid rgba(139, 120, 255, 0.3)'
                }}>
                  <div>
                    <h3 style={{ 
                      margin: 0, 
                      fontSize: '1.2rem', 
                      fontWeight: 700, 
                      color: '#9D7FEA',
                      letterSpacing: '-0.02em'
                    }}>
                      {fmtDate(showMore.date)}
                    </h3>
                    <p style={{ 
                      margin: 0, 
                      fontSize: '0.85rem', 
                      color: '#9ca3af', 
                      marginTop: '6px',
                      fontWeight: 500
                    }}>
                      {showMore.events.filter(ev => !hideEndedInDetails || !isEventEndedAsia(ev.end, ev.timezone || 'UTC+8')).length} {showMore.events.filter(ev => !hideEndedInDetails || !isEventEndedAsia(ev.end, ev.timezone || 'UTC+8')).length === 1 ? 'event' : 'events'} scheduled
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={() => setHideEndedInDetails(!hideEndedInDetails)}
                      title={hideEndedInDetails ? "Show ended events" : "Hide ended events"}
                      className="icon-btn"
                      style={{
                        background: hideEndedInDetails ? 'rgba(139, 120, 255, 0.1)' : 'rgba(255, 107, 107, 0.1)',
                        border: hideEndedInDetails ? '1px solid rgba(139, 120, 255, 0.3)' : '1px solid rgba(255, 107, 107, 0.3)',
                        color: hideEndedInDetails ? '#8b78ff' : '#ff6b6b',
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {hideEndedInDetails ? (
                          // Eye off icon
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                            <line x1="1" y1="1" x2="23" y2="23"></line>
                          </>
                        ) : (
                          // Eye icon
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </>
                        )}
                      </svg>
                    </button>

                    <button
                      className="icon-btn"
                      onClick={clearSelection}
                      title="Close"
                      aria-label="Close"
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 6L6 18"></path>
                        <path d="M6 6l12 12"></path>
                      </svg>
                    </button>
                  </div>
                </div>

                <div
                  className="show-more-list card-view"
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px', 
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto', 
                    overflowX: 'hidden',
                    paddingRight: '8px',
                    paddingBottom: '12px',
                    paddingTop: '4px'
                  }}
                >
                  {showMore.events
                    .filter(ev => !hideEndedInDetails || !isEventEndedAsia(ev.end, ev.timezone || 'UTC+8'))
                    .map((ev, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectFromShowMore(ev)}
                      className="show-more-event-card card-layout"
                      style={{ 
                        display: 'flex',
                        flexDirection: 'row',
                        gap: '12px',
                        alignItems: 'center',
                        background: 'linear-gradient(90deg, rgba(139, 120, 255, 0.03) 0%, rgba(59, 130, 246, 0.03) 100%)', 
                        border: '1px solid rgba(139, 120, 255, 0.1)', 
                        padding: '10px',
                        borderRadius: '10px',
                        textAlign: 'left', 
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        width: '100%',
                        boxSizing: 'border-box',
                        position: 'relative',
                        overflow: 'hidden',
                        minHeight: '80px'
                      }}
                    >
                      {/* Hover gradient */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'linear-gradient(90deg, rgba(139, 120, 255, 0) 0%, rgba(139, 120, 255, 0.06) 100%)',
                        opacity: 0,
                        transition: 'opacity 0.3s ease',
                        pointerEvents: 'none',
                        zIndex: 0
                      }} className="hover-gradient" />

                      {/* Compact Image */}
                      <div style={{ 
                        position: 'relative', 
                        flexShrink: 0, 
                        width: '100px',
                        height: '60px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        zIndex: 1
                      }}>
                        {ev.image ? (
                          <img 
                            src={ev.image} 
                            alt={ev.title} 
                            loading="lazy"
                            style={{ 
                              width: '100%', 
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                              transition: 'transform 0.3s ease'
                            }}
                            className="event-image"
                          />
                        ) : (
                          <div 
                            style={{ 
                              width: '100%', 
                              height: '100%',
                              background: 'linear-gradient(135deg, #374151 0%, #1f2937 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#6b7280',
                              fontSize: '10px'
                            }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </div>
                        )}
                        
                        {/* Status indicator dot */}
                        <div style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: isEventEndedAsia(ev.end, ev.timezone || 'UTC+8') ? '#6b7280' : '#22c55e',
                          border: '2px solid rgba(255, 255, 255, 0.9)',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                          zIndex: 2
                        }} />
                      </div>
                      
                      {/* Content - Optimized for scanning */}
                      <div style={{ 
                        flex: 1, 
                        minWidth: 0, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '6px',
                        zIndex: 1
                      }}>
                        {/* Title and Game */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                          <h4 style={{ 
                            margin: 0, 
                            fontWeight: 600, 
                            fontSize: '0.95rem',
                            color: '#f9fafb',
                            lineHeight: 1.3,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: '1 1 auto',
                            minWidth: 0
                          }}>
                            {ev.title}
                          </h4>
                          <span style={{ 
                            fontSize: '0.65rem',
                            color: '#a78bfa',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            flexShrink: 0
                          }}>
                            {formatGameName(ev.game)}
                          </span>
                        </div>
                        
                        {/* Dates - Inline and compact */}
                        <div style={{ 
                          display: 'flex', 
                          gap: '8px',
                          fontSize: '0.7rem',
                          alignItems: 'center',
                          color: '#9ca3af'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10"></circle>
                              <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <span style={{ fontWeight: 500, color: '#d1d5db' }}>{fmtDate(ev.start)}</span>
                          </div>
                          
                          <span style={{ color: '#4b5563' }}>→</span>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10"></circle>
                              <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <span style={{ fontWeight: 500, color: '#d1d5db' }}>{fmtDate(ev.end)}</span>
                          </div>
                          
                          {/* Status text */}
                          <span style={{
                            marginLeft: 'auto',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            color: isEventEndedAsia(ev.end, ev.timezone || 'UTC+8') ? '#9ca3af' : '#22c55e',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            {isEventEndedAsia(ev.end, ev.timezone || 'UTC+8') ? 'Ended' : 'Live'}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Banners: Active Character Test Runs */}
          <div className="card banner-card" id="banners-section">
            <h3 className="section-header">
              BANNERS ({activeBanners.length})
              <Tooltip content="Currently available character and weapon banners.">
                <span className="info-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', border: '1px solid #6b7280', fontSize: '11px', color: '#6b7280', cursor: 'help', fontWeight: 'bold' }}>i</span>
              </Tooltip>
            </h3>
            <div className="media-rows-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {activeBanners.map((banner, i) => (
                <button
                  key={i}
                  onClick={() => handleEventSelect(banner)}
                  className="media-row"
                  style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {banner.image && <img className="placeholder-img" src={banner.image} alt={banner.title} width="180" height="105" loading="lazy" />}
                    <CountdownBadge endDate={banner.end} timezone={banner.timezone || 'UTC+8'} endNote={banner.endNote} isEnded={isEventEndedAsia(banner.end, banner.timezone || 'UTC+8')} useShortFormat={useShortFormat} />
                  </div>
                  <div className="media-text">
                    <p style={{ marginBottom: '4px' }}>{banner.title}</p>
                    <span style={{ 
                      fontSize: '0.65rem',
                      color: '#a78bfa',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {formatGameName(banner.game)}
                    </span>
                  </div>
                </button>
              ))}
              {activeBanners.length === 0 && (
                <EmptyState 
                  image="/banner-empty-icon.png"
                  title="No Active Banners"
                  description="No character or weapon banners running right now."
                />
              )}
            </div>
          </div>

          {/* Upcoming Banners */}
          <div className="card banner-card" id="upcoming-banners-section">
            <h3 className="section-header">
              UPCOMING BANNERS ({upcomingBanners.length})
              <Tooltip content="Banners scheduled to release soon. Save your pulls!">
                <span className="info-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', border: '1px solid #6b7280', fontSize: '11px', color: '#6b7280', cursor: 'help', fontWeight: 'bold' }}>i</span>
              </Tooltip>
            </h3>
            <div className="media-rows-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {upcomingBanners.map((banner, i) => (
                <button
                  key={i}
                  onClick={() => handleEventSelect(banner)}
                  className="media-row"
                  style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {banner.image && <img className="placeholder-img" src={banner.image} alt={banner.title} width="180" height="105" loading="lazy" />}
                    <CountdownBadge startDate={banner.start} timezone={banner.timezone || 'UTC+8'} endNote={banner.endNote} isUpcoming={true} isEnded={isEventEndedAsia(banner.end, banner.timezone || 'UTC+8')} useShortFormat={useShortFormat} />
                  </div>
                  <div className="media-text">
                    <p style={{ marginBottom: '4px' }}>{banner.title}</p>
                    <span style={{ 
                      fontSize: '0.65rem',
                      color: '#a78bfa',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {formatGameName(banner.game)}
                    </span>
                  </div>
                </button>
              ))}
              {upcomingBanners.length === 0 && (
                <EmptyState 
                  image="/banner-empty-icon.png"
                  title="No Upcoming Banners"
                  description="New banners will be announced soon!"
                />
              )}
            </div>
          </div>

          {/* Permanent Events: events that don't have an end date */}
          {!hidePermanentEvents && (
            <div className="card banner-card" id="permanent-events-section">
              <h3 className="section-header">
                PERMANENT EVENTS ({permanent.length})
                <Tooltip content="Always available events with no end date.">
                  <span className="info-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', border: '1px solid #6b7280', fontSize: '11px', color: '#6b7280', cursor: 'help', fontWeight: 'bold' }}>i</span>
                </Tooltip>
              </h3>
              <div className="media-rows-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {permanent.map((ev, i) => (
                  <button
                    key={i}
                    onClick={() => handleEventSelect(ev)}
                    className="media-row"
                    style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {ev.image ? (
                        <img className="placeholder-img" src={ev.image} alt={ev.title} width="100" height="60" loading="lazy" />
                      ) : (
                        <div className="placeholder-img placeholder-no-image">
                          No Image
                        </div>
                      )}
                      <CountdownBadge endDate={ev.end} timezone={ev.timezone || 'UTC+8'} endNote={ev.endNote} isEnded={isEventEndedAsia(ev.end, ev.timezone || 'UTC+8')} useShortFormat={useShortFormat} />
                    </div>
                    <div className="media-text">
                      <p>{ev.title}</p>
                    </div>
                  </button>
                ))}
                {permanent.length === 0 && (
                  <EmptyState 
                    icon="♾️"
                    title="No Permanent Events"
                    description="Permanent events will appear here when available."
                  />
                )}
              </div>
            </div>
          )}
        </aside>
      </section>

      {/* Floating navigation button for mobile (single column only) */}
      {windowWidth <= 550 && (
        <>
          <button
            className="floating-nav-button"
            onClick={() => setShowNavMenu(!showNavMenu)}
            aria-label="Navigation menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          
          {showNavMenu && (
            <>
              <div className="nav-menu-overlay" onClick={() => setShowNavMenu(false)} />
              <div className="nav-menu">
                <div className="nav-menu-header">
                  <h3>Quick Navigation</h3>
                  <button onClick={() => setShowNavMenu(false)} className="nav-menu-close">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <div className="nav-menu-items">
                  <button onClick={() => scrollToSection('games-section')}>Games</button>
                  <button onClick={() => scrollToSection('limited-events-section')}>Limited Events</button>
                  <button onClick={() => scrollToSection('upcoming-events-section')}>Upcoming Events</button>
                  <button onClick={() => scrollToSection('calendar-section')}>Calendar</button>
                  <button onClick={() => scrollToSection('event-details-section')}>Event Details</button>
                  <button onClick={() => scrollToSection('banners-section')}>Banners</button>
                  <button onClick={() => scrollToSection('upcoming-banners-section')}>Upcoming Banners</button>
                </div>
              </div>
            </>
          )}
        </>
      )}
      
      {/* Donate Modal */}
      <DonateModal isOpen={showDonateModal} onClose={() => setShowDonateModal(false)} />
    </main>
  );
}


export default App;


