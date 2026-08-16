// DonateModal.jsx
// Modal for showing GCash donation information

import './DonateModal.css';

export default function DonateModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="donate-modal-overlay" onClick={onClose}>
      <div className="donate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="donate-modal-header">
          <h2>Support Event Horizon</h2>
          <button className="donate-modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="donate-modal-content">
          <p className="donate-message">
            Thank you for considering supporting Event Horizon! Your donation helps keep this project running and improving.
          </p>

          <div className="donate-method">
            <div className="donate-method-header">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              <h3>GCash</h3>
            </div>
            
            <div className="gcash-qr-container">
              <img 
                src="/gcash-qr.png" 
                alt="GCash QR Code" 
                className="gcash-qr"
              />
              <p className="qr-instruction">Scan this QR code with your GCash app</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
