// EventTable.jsx
// Comprehensive table view of all events with search, filters, sorting, and pagination

import { useState, useMemo, useEffect } from 'react';
import { allEvents } from './GameCalendar';
import { formatAsiaDate, isEventEndedAsia } from '../utils/dateUtils';
import CountdownBadge from './CountdownBadge';
import './EventTable.css';

const ITEMS_PER_PAGE = 25;

export default function EventTable({ onEventClick }) {
  // Load search query from localStorage
  const [searchQuery, setSearchQuery] = useState(() => {
    const saved = localStorage.getItem('tableSearchQuery');
    return saved || '';
  });
  
  // Get unique games from events
  const availableGames = useMemo(() => {
    const games = new Set(allEvents.map(e => e.game).filter(Boolean));
    const gamesArray = Array.from(games);
    
    // Custom order: Genshin Impact, Honkai: Star Rail, Zenless Zone Zero, Wuthering Waves, others
    const order = ['Genshin Impact', 'Honkai: Star Rail', 'Star Rail', 'Zenless Zone Zero', 'Wuthering Waves'];
    
    return gamesArray.sort((a, b) => {
      const aIndex = order.indexOf(a);
      const bIndex = order.indexOf(b);
      
      // If both are in the order array, sort by their position
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      // If only a is in the order array, it comes first
      if (aIndex !== -1) return -1;
      // If only b is in the order array, it comes first
      if (bIndex !== -1) return 1;
      // If neither is in the order array, sort alphabetically
      return a.localeCompare(b);
    });
  }, []);
  
  // Load selected games from localStorage, fallback to all games
  const [selectedGames, setSelectedGames] = useState(() => {
    const saved = localStorage.getItem('tableSelectedGames');
    if (saved) {
      return new Set(JSON.parse(saved));
    }
    return new Set(availableGames);
  });
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'start', direction: 'desc' });

  // Save search query to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('tableSearchQuery', searchQuery);
  }, [searchQuery]);
  
  // Save selected games to localStorage when they change
  useEffect(() => {
    localStorage.setItem('tableSelectedGames', JSON.stringify([...selectedGames]));
  }, [selectedGames]);

  // Toggle game filter
  const toggleGame = (game) => {
    setSelectedGames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(game)) {
        newSet.delete(game);
      } else {
        newSet.add(game);
      }
      return newSet;
    });
    setCurrentPage(1); // Reset to first page when filter changes
  };

  // Filter and sort events
  const filteredAndSortedEvents = useMemo(() => {
    let filtered = allEvents.filter(event => {
      // Filter by game
      if (!selectedGames.has(event.game)) return false;
      
      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return event.title.toLowerCase().includes(query) ||
               event.description?.toLowerCase().includes(query);
      }
      
      return true;
    });

    // Sort events
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      if (sortConfig.key === 'title') {
        aValue = a.title.toLowerCase();
        bValue = b.title.toLowerCase();
      } else if (sortConfig.key === 'start' || sortConfig.key === 'end') {
        aValue = new Date(a[sortConfig.key]).getTime();
        bValue = new Date(b[sortConfig.key]).getTime();
      } else if (sortConfig.key === 'game') {
        aValue = a.game?.toLowerCase() || '';
        bValue = b.game?.toLowerCase() || '';
      } else if (sortConfig.key === 'status') {
        // Sort by status: Active > Upcoming > Ended
        const getStatusPriority = (event) => {
          const now = new Date();
          const start = new Date(event.start);
          const end = event.end === 'Indefinite' ? new Date('2099-12-31') : new Date(event.end);
          if (end < now) return 3; // Ended
          if (start > now) return 2; // Upcoming
          return 1; // Active
        };
        aValue = getStatusPriority(a);
        bValue = getStatusPriority(b);
      }
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [allEvents, selectedGames, searchQuery, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedEvents.length / ITEMS_PER_PAGE);
  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedEvents.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedEvents, currentPage]);

  // Handle sort
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Get sort icon
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
        </svg>
      );
    }
    return sortConfig.direction === 'asc' ? (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 15l5 5 5 5" />
      </svg>
    ) : (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 9l5-5 5 5" />
      </svg>
    );
  };

  // Get game color
  const getGameColor = (game) => {
    switch (game) {
      case 'Genshin Impact': return '#FFB84D'; // Warm gold/amber - matches Genshin's elemental theme
      case 'Star Rail': return '#9D7FEA'; // Purple - matches Star Rail's cosmic theme
      case 'Zenless Zone Zero': return '#FF6B35'; // Orange/Red from ZZZ logo
      case 'Wuthering Waves': return '#4ECDC4'; // Teal/turquoise - matches Wuwa's nature theme
      default: return '#8b78ff';
    }
  };

  // Calculate duration in days
  const getDuration = (start, end) => {
    if (end === 'Indefinite') {
      return 'Permanent';
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    return `${days} day${days !== 1 ? 's' : ''}`;
  };

  return (
    <div className="event-table-container">
      <div className="table-header">
        <h2>All Events</h2>
        <p className="table-subtitle">
          Showing {paginatedEvents.length} of {filteredAndSortedEvents.length} events
        </p>
      </div>

      {/* Filters */}
      <div className="table-filters">
        {/* Search */}
        <div className="search-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Game filters */}
        <div className="game-filters">
          {availableGames.map(game => {
            // Map game names to icon filenames
            const getIconPath = (gameName) => {
              const iconMap = {
                'Star Rail': '/icons/honkai-star-rail.webp',
                'Genshin Impact': '/icons/genshin-impact.webp',
                'Zenless Zone Zero': '/icons/zenless-zone-zero.webp',
                'Wuthering Waves': '/icons/wuthering-waves.jpg'
              };
              return iconMap[gameName] || `/icons/${gameName.toLowerCase().replace(/[:\s]+/g, '-')}.webp`;
            };

            return (
              <button
                key={game}
                className={`game-filter-btn ${selectedGames.has(game) ? 'active' : ''}`}
                onClick={() => toggleGame(game)}
                style={{
                  '--game-color': getGameColor(game)
                }}
              >
                <img 
                  src={getIconPath(game)}
                  alt={game}
                  className="game-icon"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'inline-block';
                  }}
                />
                <span className="game-dot" style={{ backgroundColor: getGameColor(game), display: 'none' }} />
                {game === 'Star Rail' ? 'Honkai: Star Rail' : game}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="event-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('game')} className="sortable">
                <div className="th-content">
                  Game {getSortIcon('game')}
                </div>
              </th>
              <th onClick={() => handleSort('title')} className="sortable">
                <div className="th-content">
                  Event Name {getSortIcon('title')}
                </div>
              </th>
              <th onClick={() => handleSort('start')} className="sortable">
                <div className="th-content">
                  Start Date {getSortIcon('start')}
                </div>
              </th>
              <th onClick={() => handleSort('end')} className="sortable">
                <div className="th-content">
                  End Date {getSortIcon('end')}
                </div>
              </th>
              <th>Duration</th>
              <th onClick={() => handleSort('status')} className="sortable">
                <div className="th-content">
                  Status {getSortIcon('status')}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedEvents.map((event, index) => (
              <tr 
                key={`${event.title}-${event.start}-${index}`}
                onClick={() => onEventClick && onEventClick(event)}
                style={{ cursor: onEventClick ? 'pointer' : 'default' }}
                className="clickable-row"
              >
                <td>
                  <div className="game-cell">
                    <span className="game-dot" style={{ backgroundColor: getGameColor(event.game) }} />
                    {event.game}
                  </div>
                </td>
                <td className="event-name-cell">
                  <div className="event-name-content">
                    {event.image && (
                      <img src={event.image} alt={event.title} className="event-thumb" loading="lazy" />
                    )}
                    <span>{event.title}</span>
                  </div>
                </td>
                <td>{formatAsiaDate(new Date(event.start))}</td>
                <td>{formatAsiaDate(new Date(event.end))}</td>
                <td>{getDuration(event.start, event.end)}</td>
                <td>
                  <CountdownBadge
                    startDate={event.start}
                    endDate={event.end}
                    timezone={event.timezone || 'UTC+8'}
                    endNote={event.endNote}
                    isUpcoming={new Date(event.start) > new Date()}
                    isEnded={isEventEndedAsia(event.end)}
                    useShortFormat={true}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
          >
            First
          </button>
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            &lt;
          </button>
          
          <div className="pagination-info">
            Page {currentPage} of {totalPages}
          </div>
          
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            &gt;
          </button>
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
          >
            Last
          </button>
        </div>
      )}
    </div>
  );
}
