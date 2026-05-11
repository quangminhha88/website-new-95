/**
 * Class-name utility used throughout shadcn/ui components.
 *
 * `clsx` handles conditional class composition; `twMerge` resolves
 * conflicting Tailwind utilities so later classes win predictably
 * (e.g. cn('p-2', 'p-4') → 'p-4').
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
