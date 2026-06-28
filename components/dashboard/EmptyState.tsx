import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="dash-empty">
      <Icon className="dash-empty-icon" size={30} strokeWidth={1.5} />
      <div className="dash-empty-title">{title}</div>
      {description && <div className="dash-empty-desc">{description}</div>}
      {action && (
        <div className="dash-empty-action">
          <button className="dash-btn" data-variant="primary" data-size="sm" onClick={action.onClick}>
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}
