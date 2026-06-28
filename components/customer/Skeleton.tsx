import type { CSSProperties } from 'react';

interface SkeletonBlockProps {
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}

export function SkeletonBlock({ width = '100%', height = 14, style }: SkeletonBlockProps) {
  return <div className="ov-skeleton" style={{ width, height, ...style }} />;
}

export function SkeletonProducts({ rows = 4 }: { rows?: number }) {
  return (
    <div className="ov-products">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="ov-product" key={i} style={{ cursor: 'default' }}>
          <div style={{ width: 84, height: 84, flex: 'none' }}>
            <SkeletonBlock width={84} height={84} style={{ borderRadius: 10 }} />
          </div>
          <div className="ov-product-body">
            <SkeletonBlock width="60%" height={16} />
            <SkeletonBlock width="90%" height={13} style={{ marginTop: 8 }} />
            <SkeletonBlock width="30%" height={15} style={{ marginTop: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonOrder() {
  return (
    <div className="ov-card">
      <SkeletonBlock width="50%" height={16} />
      <div style={{ marginTop: 18 }}>
        <SkeletonBlock width="100%" height={14} />
        <SkeletonBlock width="100%" height={14} style={{ marginTop: 10 }} />
        <SkeletonBlock width="100%" height={14} style={{ marginTop: 10 }} />
      </div>
    </div>
  );
}
