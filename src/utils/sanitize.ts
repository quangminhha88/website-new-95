import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'br', 'span', 'div'];
const ALLOWED_ATTR = ['href', 'class', 'target', 'rel'];

/**
 * Sanitizes HTML on the client side using DOMPurify.
 * Safe to use in dangerouslySetInnerHTML.
 */
export function sanitizeHTML(dirty: string): string {
  if (typeof window === 'undefined' || !dirty) return dirty || '';
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS, ALLOWED_ATTR });
}

/**
 * Strips all HTML tags from a string (for plain text contexts).
 */
export function stripHTML(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
}
