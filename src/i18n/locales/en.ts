/**
 * English translations.
 *
 * This file is the source of truth — its TYPE defines what every other
 * locale must implement. Add new keys here first, then translate to other
 * locales (TypeScript will flag missing keys at compile time).
 */
export const en = {
  common: {
    save: 'Save',
    saved: 'Saved',
    cancel: 'Cancel',
    submit: 'Submit',
    search: 'Search',
    loading: 'Loading…',
    error: 'Something went wrong',
    retry: 'Try again',
    close: 'Close',
    next: 'Next',
    previous: 'Previous',
    seeMore: 'See more',
    backToHome: 'Back to home',
  },
  nav: {
    home: 'Home',
    finder: 'AI Finder',
    categories: 'Categories',
    account: 'Account',
    signIn: 'Sign in',
    signOut: 'Sign out',
  },
  home: {
    heroTagline: 'AI-Powered Tool Matching Engine',
    heroTitle: 'The Ultimate Hub for SaaS Excellence',
    heroSubtitle:
      "Discover, compare, and implement the world's best software. Curated by experts, powered by AI.",
    findMyStack: 'Find Your Stack — AI Match',
    browseTopTools: 'Browse Top Tools',
    browseByCategory: 'Browse by Category',
    featuredTools: "Today's Featured Tools",
    featuredSubtitle: 'Software our experts recommend as the gold standard.',
  },
  tool: {
    pricing: 'Pricing',
    features: 'Key Features',
    pros: 'Pros',
    cons: 'Cons',
    useCases: 'Common Use Cases',
    faqs: 'Frequently Asked Questions',
    expertVerdict: 'Expert Verdict',
    alternatives: 'Best Alternatives',
    startingAt: 'Starting at',
    perMonth: '/mo',
    getStarted: 'Get Started with {tool}',
    visitWebsite: 'Visit website',
  },
  finder: {
    title: 'Smart Finder',
    placeholder: 'Describe what you need… (e.g. "CRM for solo consultants under $50/mo")',
    findButton: 'Find tools',
    noResults: 'No matches yet. Try broader keywords.',
    suggestions: 'Try one of these:',
  },
  account: {
    title: 'Your Account',
    savedTools: 'Saved Tools',
    searchHistory: 'Search History',
    collections: 'Collections',
    noSaved: "You haven't saved any tools yet.",
    noHistory: 'No search history yet.',
  },
  legal: {
    affiliateDisclosure: 'Affiliate disclosure',
    privacy: 'Privacy',
    terms: 'Terms',
  },
} as const;

export default en;
