import { useState, type ImgHTMLAttributes } from 'react';

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onError'> {
  src?: string;
  alt: string;
  fallbackText?: string;
  priority?: boolean;
  fallback?: React.ReactNode;
}

/**
 * Drop-in <img> replacement with:
 *   - Lazy loading + async decoding
 *   - Skeleton placeholder until loaded
 *   - Initials fallback on error
 *   - referrerPolicy=no-referrer for cross-origin logos
 */
export default function OptimizedImage({
  src,
  alt,
  fallbackText,
  priority = false,
  fallback,
  className = '',
  ...rest
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    if (fallback) return <>{fallback}</>;
    const letter = (fallbackText ?? alt).trim()[0]?.toUpperCase() ?? '?';
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-blue-100 text-indigo-700 font-bold ${className}`}
        aria-label={alt}
      >
        {letter}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {!loaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse rounded-[inherit] bg-gray-100"
        />
      )}
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={`block h-full w-full transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        {...rest}
      />
    </div>
  );
}
