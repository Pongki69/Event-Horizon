import './EmptyState.css';

function EmptyState({ icon, image, title, description, action }) {
  return (
    <div className="empty-state">
      {image ? (
        <img src={image} alt={title} className="empty-state-image" />
      ) : (
        <div className="empty-state-icon">{icon}</div>
      )}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

export default EmptyState;
