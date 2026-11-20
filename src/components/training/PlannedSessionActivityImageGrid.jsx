import './plannedSessionActivityImageGrid.css';

export default function PlannedSessionActivityImageGrid({ images = [], className = '' }) {
  if (!images.length) return null;
  const layout = images.length >= 5 ? 'many' : String(images.length);
  return <div className={`planned-activity-image-grid ${className}`} data-image-count={layout}>
    {images.map((image) => <figure key={image.id}>
      <img src={image.signedUrl} alt={image.originalName || 'Imagen de la actividad'} />
    </figure>)}
  </div>;
}
