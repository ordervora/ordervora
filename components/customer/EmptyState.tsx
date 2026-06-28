import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="ov-empty">
      <Icon className="ov-empty-icon" size={32} strokeWidth={1.5} />
      <div className="ov-empty-title">{title}</div>
      {description && <div className="ov-empty-desc">{description}</div>}
      {action && (
        <div className="ov-empty-action">
          <button className="ov-btn" data-variant="ghost" onClick={action.onClick}>
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}
