import { useState } from 'react';

import {
  buildLogoImageUrl,
  initialsFromName,
} from '@/features/subscriptions/icons/client';
import { cn } from '@/lib/utils';

const sizeStyles = {
  sm: { box: 'size-6 text-[10px]', px: 48 },
  md: { box: 'size-8 text-xs', px: 64 },
  lg: { box: 'size-10 text-sm', px: 80 },
} as const;

type SubscriptionIconProps = {
  /** Domain stored on the subscription (iconRef), e.g. "netflix.com". */
  domain: string;
  /** Subscription name, used for the initials fallback and alt text. */
  name: string;
  size?: keyof typeof sizeStyles;
  className?: string;
};

export function SubscriptionIcon({
  domain,
  name,
  size = 'md',
  className,
}: SubscriptionIconProps) {
  const styles = sizeStyles[size];
  const src = buildLogoImageUrl(domain, styles.px);
  // Remembers which URL failed, so a new domain or size gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== null && src !== failedSrc;

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 ring-inset ring-border',
        // Logos get an off-white backing so transparent, dark-inked marks stay
        // visible in dark mode; the initials fallback stays theme-aware.
        showImage
          ? 'bg-logo-surface'
          : 'bg-muted font-medium text-muted-foreground',
        styles.box,
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          className="size-full object-contain"
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span aria-hidden>{initialsFromName(name)}</span>
      )}
    </span>
  );
}
