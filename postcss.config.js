// Tailwind v4 uses a single PostCSS plugin (@tailwindcss/postcss) that
// bundles autoprefixer + the v4 engine. Do NOT use the v3-style
// `tailwindcss: {}` plugin here — that's the v3 plugin and won't load
// the @theme blocks in src/styles/globals.css.
//
// ESM export form because package.json has "type": "module".
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
