// packages/ui/src/primitives/Skeleton.tsx
//
// Linear-gradient sweep. Width/height tunable; default fills its container.

export interface SkeletonProps {
  w?: number | string;
  h?: number | string;
  radius?: string;
}

export function Skeleton({ w = '100%', h = 12, radius }: SkeletonProps) {
  return (
    <span
      className="inline-block animate-xp-skel rounded-xp-sm"
      style={{
        width: w,
        height: h,
        ...(radius ? { borderRadius: radius } : {}),
        background:
          'linear-gradient(90deg, var(--xp-layer) 0%, var(--xp-hairline) 50%, var(--xp-layer) 100%)',
        backgroundSize: '200% 100%',
      }}
    />
  );
}
