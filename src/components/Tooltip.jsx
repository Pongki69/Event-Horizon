// Tooltip.jsx
// Professional tooltip component with smooth animations

import { useState, useRef, useEffect } from 'react';
import './Tooltip.css';

export default function Tooltip({ children, content }) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState('top');
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (isVisible && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceLeft = rect.left;
      const spaceRight = window.innerWidth - rect.right;

      // On small screens, prefer vertical positioning
      if (window.innerWidth < 768) {
        if (spaceBelow > spaceAbove && spaceBelow > 100) {
          setPosition('bottom');
        } else if (spaceAbove > 100) {
          setPosition('top');
        } else if (spaceRight > 200) {
          setPosition('right');
        } else {
          setPosition('left');
        }
      } else {
        // On larger screens, prefer top positioning
        if (spaceAbove > 80) {
          setPosition('top');
        } else if (spaceBelow > 80) {
          setPosition('bottom');
        } else if (spaceRight > 250) {
          setPosition('right');
        } else {
          setPosition('left');
        }
      }
    }
  }, [isVisible]);

  return (
    <span 
      ref={wrapperRef}
      className="tooltip-wrapper"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <span className={`tooltip-content tooltip-${position}`}>
          {content}
        </span>
      )}
    </span>
  );
}
