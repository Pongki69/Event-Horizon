import './LoadingScreen.css';

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <img src="/favicon.png" alt="Event Horizon Logo" className="loading-logo" />
        <h2 className="loading-title">Event Horizon</h2>
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <p className="loading-text">Loading events...</p>
      </div>
    </div>
  );
}

export default LoadingScreen;
