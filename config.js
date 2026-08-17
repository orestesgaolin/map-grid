/* Site configuration. Plain script, loaded before the app modules.
 *
 * Analytics is off until a provider and a site key are filled in, so nothing is
 * requested from a third party by default. All three supported providers are
 * cookieless and store no personal data.
 *
 *   goatcounter  https://www.goatcounter.com — free for personal use, open
 *                source. `site` is the subdomain you registered:
 *                for https://mapgrid.goatcounter.com use site: 'mapgrid'.
 *   plausible    https://plausible.io — paid or self-hosted. `site` is the
 *                domain you added, `host` an optional self-hosted origin.
 *   umami        https://umami.is — self-hosted. `site` is the website id and
 *                `host` the origin serving script.js.
 */
window.MAPGRID = {
  repo: 'https://github.com/orestesgaolin/map-grid',

  // Printed at the right of the footer line on every map, and in exports.
  // Set to '' to leave it out.
  siteLabel: 'roszkowski.dev/map-grid',

  analytics: {
    provider: 'none', // 'goatcounter' | 'plausible' | 'umami' | 'none'
    site: '',
    host: '',

    // Skip people who ask not to be measured, through Do Not Track or the
    // Global Privacy Control signal.
    respectPrivacySignals: true,

    // Keep local development out of the statistics.
    allowLocalhost: false,
  },
};
