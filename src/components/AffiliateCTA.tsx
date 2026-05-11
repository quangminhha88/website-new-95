import * as React from 'react';
import { ExternalLink, Sparkles, ArrowRight, Clock, Tag } from 'lucide-react';
import { motion } from 'motion/react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Affiliate CTA — central conversion component.
 *
 * Variants:
 *   primary   — bold solid button, default for high-EPC tools
 *   secondary — outline, used in dense contexts
 *   featured  — gradient, attention-getter
 *   sticky    — bottom-right floating
 *   urgency   — scarcity framing ("Limited time")
 *   discount  — promo framing with tag icon
 *
 * Tracking: pass `variantIndex` from useDynamicCTA — appended to the
 * tracked URL so /api/redirect can log per-variant CTR to seo_metrics.
 */
const ctaVariants = cva(
  'inline-flex items-center justify-center gap-2 font-bold text-center select-none ' +
    'transition-all duration-300 cursor-pointer ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        primary:
          'rounded-xl px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md hover:shadow-xl active:scale-95',
        secondary:
          'rounded-xl px-6 py-3 bg-background text-primary border-2 border-primary hover:bg-primary/5 shadow-sm',
        featured:
          'rounded-xl px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:opacity-90 shadow-[0_0_20px_rgba(79,70,229,0.3)] animate-pulse-slow',
        sticky:
          'fixed bottom-6 right-6 z-50 rounded-full px-10 py-4 bg-primary text-primary-foreground shadow-2xl hover:scale-105 active:scale-95',
        urgency:
          'rounded-xl px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-md',
        discount:
          'rounded-xl px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-md',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

type CTAVariant = NonNullable<VariantProps<typeof ctaVariants>['variant']>;

interface AffiliateCTAProps
  extends Omit<
      React.AnchorHTMLAttributes<HTMLAnchorElement>,
      'href' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd'
    >,
    VariantProps<typeof ctaVariants> {
  slug: string;
  name: string;
  ctaText?: string;
  source?: string;
  /** Variant index from useDynamicCTA, tracked on click */
  variantIndex?: number;
}

const ICONS: Partial<Record<CTAVariant, React.ReactNode>> = {
  featured: <Sparkles size={18} className="animate-spin-slow" aria-hidden />,
  urgency: <Clock size={16} aria-hidden />,
  discount: <Tag size={16} aria-hidden />,
};

const DEFAULT_TEXT_BY_VARIANT: Record<CTAVariant, (n: string) => string> = {
  primary: (n) => `Try ${n} Now`,
  secondary: (n) => `Try ${n}`,
  featured: (n) => `Get Best Deal on ${n}`,
  urgency: () => 'Start Free — Limited Time',
  discount: () => 'Claim Your Discount',
  sticky: (n) => `Try ${n}`,
};

export const AffiliateCTA = React.forwardRef<HTMLAnchorElement, AffiliateCTAProps>(
  (
    {
      slug,
      name,
      variant = 'primary',
      ctaText,
      source = 'cta-component',
      variantIndex,
      className,
      ...props
    },
    ref,
  ) => {
    const v = (variant ?? 'primary') as CTAVariant;
    const url = new URL(`/go/${slug}`, 'http://_');
    url.searchParams.set('src', source);
    url.searchParams.set('cv', v);
    if (variantIndex !== undefined) {
      url.searchParams.set('vi', String(variantIndex));
    }
    const href = `${url.pathname}${url.search}`;
    const label = ctaText ?? DEFAULT_TEXT_BY_VARIANT[v](name);

    return (
      <motion.a
        ref={ref}
        href={href}
        target="_blank"
        rel="nofollow sponsored"
        aria-label={label}
        data-cta-variant={v}
        data-cta-index={variantIndex}
        className={cn(ctaVariants({ variant: v }), className)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        {...props}
      >
        {ICONS[v]}
        <span>{label}</span>
        {v === 'sticky' ? <ExternalLink size={20} aria-hidden /> : <ArrowRight size={18} aria-hidden />}
      </motion.a>
    );
  },
);
AffiliateCTA.displayName = 'AffiliateCTA';

export default AffiliateCTA;
