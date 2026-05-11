/**
 * Legal pages — Privacy, Terms, Affiliate Disclosure.
 *
 * One component per page is overkill since they all share the same chrome
 * (centred container, prose styles, metadata). One module exposing three
 * lazy-loadable defaults keeps the route table simple.
 */
import SEO from '@/components/SEO';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const LAST_UPDATED = '2026-01-15';
const CONTACT_EMAIL = 'privacy@saas-excellence.com';

function LegalShell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="min-h-screen bg-white">
      <SEO title={title} canonical={`/${title.toLowerCase().replace(/\s+/g, '-')}`} />
      <div className="border-b border-gray-100">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to directory
          </Link>
        </div>
      </div>
      <article className="mx-auto max-w-3xl px-4 py-12">
        <div className="prose prose-blue max-w-none">{children}</div>
        <p className="mt-12 border-t border-gray-100 pt-6 text-xs text-gray-500">
          Last updated: {LAST_UPDATED}
        </p>
      </article>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <h1>Privacy Policy</h1>
      <p>
        We are committed to protecting your privacy. This policy explains what data we
        collect and how we use it.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Anonymous analytics</strong> — page views, dwell time, click events
          (impressions and outbound link clicks). Collected via a 90-day visitor cookie that
          contains no personal information.
        </li>
        <li>
          <strong>Account data</strong> — if you sign up: email, password (hashed), saved
          tools, collections, search history.
        </li>
        <li>
          <strong>Web Vitals</strong> — performance metrics (LCP, CLS, INP) tied to page
          paths only — no user identifiers.
        </li>
        <li>
          <strong>Server logs</strong> — IP address and user-agent for affiliate redirects
          (used to detect fraudulent clicks; auto-purged after 90 days).
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run the directory and personalize recommendations</li>
        <li>To detect and prevent abusive traffic</li>
        <li>To compute aggregate metrics for editorial decisions</li>
      </ul>

      <h2>What we don't do</h2>
      <ul>
        <li>We do not sell your data</li>
        <li>We do not use third-party advertising trackers</li>
        <li>We do not share account data with affiliate partners</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        Essential cookies (session, CSRF, A/B variant assignment) are always set. Optional
        analytics cookies are only set if you accept the cookie banner. You can change your
        preferences at any time by clearing site data.
      </p>

      <h2>Your rights (GDPR / CCPA)</h2>
      <p>
        You have the right to access, export, or delete your account data. Email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with your request and we
        will respond within 30 days.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <h1>Terms of Service</h1>
      <p>
        By using this site, you agree to these terms. If you don't agree, please don't use
        the site.
      </p>

      <h2>Use of the directory</h2>
      <p>
        You may browse, search, and save tools for personal or business use. You may not:
      </p>
      <ul>
        <li>Scrape the site for redistribution without permission</li>
        <li>Submit false or misleading reviews</li>
        <li>Use automated tools to inflate clicks or impressions</li>
        <li>Attempt to circumvent rate limits or access controls</li>
      </ul>

      <h2>Account responsibilities</h2>
      <p>
        You are responsible for keeping your password secure. Notify us immediately if you
        suspect unauthorized access.
      </p>

      <h2>Affiliate links and recommendations</h2>
      <p>
        We earn commissions when you sign up to some tools through our links. See our{' '}
        <Link href="/disclosure">affiliate disclosure</Link> for details. Recommendations are
        editorial — commissions do not influence which tools rank higher; they are simply a
        way the site sustains itself.
      </p>

      <h2>Disclaimer</h2>
      <p>
        Tool reviews, comparisons, and recommendations are our editorial opinion, not legal,
        financial, or technical advice. We make reasonable efforts to keep information
        accurate but cannot guarantee accuracy. Verify pricing and features on the tool's
        own site before purchasing.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        We are not liable for any damages arising from your use of this site or third-party
        tools we link to.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. Material changes will be announced on the homepage.</p>
    </LegalShell>
  );
}

export function DisclosurePage() {
  return (
    <LegalShell title="Affiliate Disclosure">
      <h1>Affiliate Disclosure</h1>
      <p>
        This site contains affiliate links. When you click an affiliate link and make a
        purchase or sign up, we may earn a commission — at <strong>no extra cost</strong> to
        you.
      </p>

      <h2>How it works</h2>
      <p>
        When you click "Try X" on a tool page, you're redirected through{' '}
        <code>/api/redirect/[slug]</code>, which logs the referral and sends you to the
        tool's own signup page (sometimes with a tracking parameter that identifies us as
        the referrer). If you sign up or purchase, the tool pays us a commission.
      </p>

      <h2>Editorial independence</h2>
      <p>
        Commission rates do <strong>not</strong> determine which tools we cover or how we
        rank them. Our editorial team writes reviews based on our own testing, user feedback,
        and feature analysis. Tools without affiliate programs are reviewed and recommended
        on the same terms as paid partners.
      </p>

      <h2>Why we use affiliate links</h2>
      <p>
        Affiliate revenue lets us keep the directory free and ad-free. The alternative would
        be banner ads or paywalled reviews — we think affiliate revenue is a fairer model
        for everyone.
      </p>

      <h2>FTC compliance</h2>
      <p>
        This disclosure is provided in compliance with the U.S. Federal Trade Commission's{' '}
        <a
          href="https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers"
          target="_blank"
          rel="noopener noreferrer"
        >
          16 CFR Part 255
        </a>{' '}
        and similar regulations in the EU and UK.
      </p>

      <h2>Questions?</h2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalShell>
  );
}
