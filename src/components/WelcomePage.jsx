import { useState, useEffect } from 'react';
import './WelcomePage.css';

function WelcomePage({ onGetStarted }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [visitorCount, setVisitorCount] = useState(null);

  useEffect(() => {
    fetch('/visitor-count.json')
      .then(r => r.json())
      .then(data => { if (data.count != null) setVisitorCount(data.count); })
      .catch(() => {});
  }, []);

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
        }
      });
    }, observerOptions);

    // Observe all sections and animated elements
    const sections = document.querySelectorAll('.features-section, .app-footer');
    const animatedElements = document.querySelectorAll('.section-title, .section-subtitle, .feature-card-new, .game-card-fullscreen');
    
    sections.forEach(section => observer.observe(section));
    animatedElements.forEach(element => observer.observe(element));

    return () => observer.disconnect();
  }, []);
  
  // Screenshots - you can add your actual screenshot paths here
  const screenshots = [
    {
      src: '/images/genshin-impact/banners/genshin-impact.png',
      alt: 'Event Horizon Calendar View',
      caption: 'Interactive calendar showing all events'
    },
    {
      src: '/images/genshin-impact/banners/genshin-impact.png',
      alt: 'Event Details View',
      caption: 'Detailed event information with countdowns'
    },
    {
      src: '/images/genshin-impact/banners/genshin-impact.png',
      alt: 'Multi-Game Support',
      caption: 'Track events across multiple games'
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % screenshots.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [screenshots.length]);

  const goToSlide = (index) => {
    setCurrentSlide(index);
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % screenshots.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + screenshots.length) % screenshots.length);
  };

  return (
    <div className="welcome-page-new">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Event Horizon</h1>
          <p className="hero-subtitle">Your Ultimate Gaming Event Tracker</p>
          <p className="hero-description">
            Track all events, banners, and endgame content across multiple gacha games in one place. 
            Never miss an event again with real-time countdowns and automatic daily updates.
          </p>
          <button className="hero-cta" onClick={onGetStarted}>
            Get Started
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-container">
          <h2 className="section-title">Why Event Horizon?</h2>
          <p className="section-subtitle">
            The most comprehensive event tracking platform for gacha game enthusiasts. Never miss an event, banner, or endgame reset again.
          </p>
          <div className="features-grid-new">
            <div className="feature-card-new">
              <div className="feature-icon-wrapper">
                <svg className="feature-icon-new" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </div>
              <div className="feature-content">
                <h3>Interactive Calendar</h3>
                <p>Visual timeline showing all events across multiple games with intuitive navigation and color-coded game indicators</p>
                <span className="feature-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  Core Feature
                </span>
              </div>
            </div>
            <div className="feature-card-new">
              <div className="feature-icon-wrapper">
                <svg className="feature-icon-new" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <div className="feature-content">
                <h3>Live Countdowns</h3>
                <p>Real-time countdowns for event start and end times, automatically adjusted to your timezone for perfect accuracy</p>
                <span className="feature-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  Real-Time
                </span>
              </div>
            </div>
            <div className="feature-card-new">
              <div className="feature-icon-wrapper">
                <svg className="feature-icon-new" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <div className="feature-content">
                <h3>Endgame Tracking</h3>
                <p>Automatic tracking of recurring endgame content like Abyss, Pure Fiction, and Tower rotations with reset timers</p>
                <span className="feature-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  Automated
                </span>
              </div>
            </div>
            <div className="feature-card-new">
              <div className="feature-icon-wrapper">
                <svg className="feature-icon-new" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
              </div>
              <div className="feature-content">
                <h3>Auto-Updated Daily</h3>
                <p>Data automatically refreshed every day from official wikis and sources, ensuring you always have the latest information</p>
                <span className="feature-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  Daily Sync
                </span>
              </div>
            </div>
            <div className="feature-card-new">
              <div className="feature-icon-wrapper">
                <svg className="feature-icon-new" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                </svg>
              </div>
              <div className="feature-content">
                <h3>Customizable View</h3>
                <p>Toggle games on/off to focus on what matters to you. Hide ended events or permanent content for a cleaner view</p>
                <span className="feature-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  Flexible
                </span>
              </div>
            </div>
            <div className="feature-card-new">
              <div className="feature-icon-wrapper">
                <svg className="feature-icon-new" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
              </div>
              <div className="feature-content">
                <h3>Fully Responsive</h3>
                <p>Seamless experience across all devices - desktop, tablet, and mobile. Access your event calendar anywhere, anytime</p>
                <span className="feature-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  Cross-Platform
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Supported Games Section */}
      <section className="games-section-fullscreen">
        <div className="games-header">
          <h2 className="section-title">Supported Games</h2>
          <p className="section-subtitle">
            Track events, banners, and endgame content across all major gacha games in one unified platform
          </p>
        </div>

        {/* Game 1 - Genshin Impact */}
        <div className="game-card-fullscreen" style={{ backgroundImage: 'url(/game-bg-genshin.png)' }}>
          <div className="game-card-overlay"></div>
          <div className="game-card-content">
            <div className="game-card-icon">
              <img src="/icons/genshin-impact.webp" alt="Genshin Impact" />
            </div>
            <h3>Genshin Impact</h3>
            <p>Track limited events, character & weapon banners, Spiral Abyss, and Imaginarium Theater rotations with real-time countdowns and automatic daily updates.</p>
            <div className="game-features">
              <div className="game-feature-item"><div className="game-feature-item-number">100+</div><div className="game-feature-item-label">Events Tracked</div></div>
              <div className="game-feature-item"><div className="game-feature-item-number">24/7</div><div className="game-feature-item-label">Auto-Updates</div></div>
              <div className="game-feature-item"><div className="game-feature-item-number">695+</div><div className="game-feature-item-label">Events History</div></div>
            </div>
          </div>
        </div>

        {/* Game 2 - Honkai Star Rail */}
        <div className="game-card-fullscreen" style={{ backgroundImage: 'url(/game-bg-starrail.png)' }}>
          <div className="game-card-overlay"></div>
          <div className="game-card-content">
            <div className="game-card-icon">
              <img src="/icons/honkai-star-rail.webp" alt="Honkai: Star Rail" />
            </div>
            <h3>Honkai: Star Rail</h3>
            <p>Monitor events, warp banners, Memory of Chaos, Pure Fiction, and Apocalyptic Shadow cycles with precise timing and comprehensive event details.</p>
            <div className="game-features">
              <div className="game-feature-item"><div className="game-feature-item-number">80+</div><div className="game-feature-item-label">Events Tracked</div></div>
              <div className="game-feature-item"><div className="game-feature-item-number">100%</div><div className="game-feature-item-label">Banner Tracking</div></div>
              <div className="game-feature-item"><div className="game-feature-item-number">240</div><div className="game-feature-item-label">Events History</div></div>
            </div>
          </div>
        </div>

        {/* Game 3 - Zenless Zone Zero */}
        <div className="game-card-fullscreen" style={{ backgroundImage: 'url(/game-bg-zzz.png)' }}>
          <div className="game-card-overlay"></div>
          <div className="game-card-content">
            <div className="game-card-icon">
              <img src="/icons/zenless-zone-zero.webp" alt="Zenless Zone Zero" />
            </div>
            <h3>Zenless Zone Zero</h3>
            <p>Keep track of limited events, exclusive banners, and endgame content with real-time countdowns and detailed event information.</p>
            <div className="game-features">
              <div className="game-feature-item"><div className="game-feature-item-number">60+</div><div className="game-feature-item-label">Events Tracked</div></div>
              <div className="game-feature-item"><div className="game-feature-item-number">100%</div><div className="game-feature-item-label">Exclusive Banners</div></div>
              <div className="game-feature-item"><div className="game-feature-item-number">351</div><div className="game-feature-item-label">Events History</div></div>
            </div>
          </div>
        </div>

        {/* Game 4 - Wuthering Waves */}
        <div className="game-card-fullscreen" style={{ backgroundImage: 'url(/game-bg-wuwa.jpg)' }}>
          <div className="game-card-overlay"></div>
          <div className="game-card-content">
            <div className="game-card-icon">
              <img src="/icons/wuthering-waves.jpg" alt="Wuthering Waves" />
            </div>
            <h3>Wuthering Waves</h3>
            <p>Follow events, convene banners, Tower of Adversity, and all endgame content rotations with accurate timing and comprehensive tracking.</p>
            <div className="game-features">
              <div className="game-feature-item"><div className="game-feature-item-number">50+</div><div className="game-feature-item-label">Events Tracked</div></div>
              <div className="game-feature-item"><div className="game-feature-item-number">100%</div><div className="game-feature-item-label">Convene Tracking</div></div>
              <div className="game-feature-item"><div className="game-feature-item-number">86</div><div className="game-feature-item-label">Events History</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="app-footer">
        <p className="footer-credit">
          Vibe coded by{' '}
          <a 
            href="https://www.facebook.com/Pongki23/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="footer-link"
          >
            Alfonso Panisales
          </a>
        </p>
        <p className="footer-sources">
          Data from{' '}
          <a href="https://genshin-impact.fandom.com" target="_blank" rel="noopener noreferrer" className="footer-link">Genshin Impact Wiki</a>
          {' | '}
          <a href="https://honkai-star-rail.fandom.com" target="_blank" rel="noopener noreferrer" className="footer-link">Honkai: Star Rail Wiki</a>
          {' | '}
          <a href="https://zenless-zone-zero.fandom.com" target="_blank" rel="noopener noreferrer" className="footer-link">Zenless Zone Zero Wiki</a>
          {' | '}
          <a href="https://wutheringwaves.fandom.com" target="_blank" rel="noopener noreferrer" className="footer-link">Wuthering Waves Wiki</a>
          {' | '}
          <a href="https://game8.co" target="_blank" rel="noopener noreferrer" className="footer-link">Game8</a>
        </p>
        <p className="footer-disclaimer">
          Not affiliated with HoYoverse or Kuro Games
        </p>
        <p className="footer-copyright">
          © 2026 Event Horizon • Last updated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {visitorCount != null && (
            <span style={{ marginLeft: '12px', opacity: 0.7 }}>
              •{' '}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {visitorCount.toLocaleString()} visitors
            </span>
          )}
        </p>
      </footer>
    </div>
  );
}

export default WelcomePage;










