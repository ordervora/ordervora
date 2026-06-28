import type { CSSProperties } from 'react';

interface SkeletonBlockProps {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}

export function SkeletonBlock({ width = '100%', height = 14, style }: SkeletonBlockProps) {
  return <div className="dash-skeleton" style={{ width, height, ...style }} />;
}

export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="dash-kpis">
      {Array.from({ length: count }).map((_, i) => (
        <div className="dash-kpi" key={i}>
          <SkeletonBlock width="60%" height={11} />
          <SkeletonBlock width="75%" height={26} style={{ marginTop: 10 }} />
          <SkeletonBlock width="40%" height={11} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <table className="dash-table">
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: columns }).map((_, c) => (
              <td key={c}>
                <SkeletonBlock width={c === 0 ? '70%' : '45%'} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SkeletonFeed({ rows = 4 }: { rows?: number }) {
  return (
    <div className="dash-feed">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="dash-feed-item" key={i}>
          <span className="dash-feed-dot" style={{ background: 'var(--line-strong)' }} />
          <div style={{ flex: 1 }}>
            <SkeletonBlock width="80%" height={13} />
            <SkeletonBlock width="30%" height={11} style={{ marginTop: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
