type ZosMarkProps = {
  variant?: 'linear' | 'chrome';
  className?: string;
  decorative?: boolean;
};

export function ZosMark({ variant = 'linear', className, decorative = true }: ZosMarkProps) {
  return (
    <img
      className={className}
      src={`/brand/zos-mark-${variant}.svg`}
      alt={decorative ? '' : 'Z Operating System'}
      aria-hidden={decorative ? true : undefined}
    />
  );
}
