// Optional, cookieless analytics.
//
// Nothing loads unless config.js names a provider and a site key, so a plain
// checkout makes no third-party requests at all. Only counts are sent: a page
// view, and events naming which export or preset was used. No map contents, no
// coordinates, no identifiers.

const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '']);

let provider = null;
let ready = false;
const queue = [];

function config() {
  return globalThis.MAPGRID?.analytics || {};
}

/** True when the visitor has asked not to be measured. */
function privacySignal() {
  return (
    navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === '1' ||
    globalThis.doNotTrack === '1' ||
    navigator.msDoNotTrack === '1'
  );
}

function scriptFor(settings) {
  const script = document.createElement('script');
  script.async = true;
  switch (settings.provider) {
    case 'goatcounter':
      script.src = 'https://gc.zgo.at/count.js';
      script.dataset.goatcounter = settings.host
        ? `${settings.host.replace(/\/$/, '')}/count`
        : `https://${settings.site}.goatcounter.com/count`;
      break;
    case 'plausible':
      script.src = `${(settings.host || 'https://plausible.io').replace(/\/$/, '')}/js/script.js`;
      script.dataset.domain = settings.site;
      break;
    case 'umami':
      if (!settings.host) return null;
      script.src = `${settings.host.replace(/\/$/, '')}/script.js`;
      script.dataset.websiteId = settings.site;
      break;
    default:
      return null;
  }
  return script;
}

/**
 * Loads the configured provider. Returns the provider name, or null when
 * analytics stays off — unconfigured, running locally, or opted out.
 */
export function initAnalytics() {
  const settings = config();
  if (!settings.provider || settings.provider === 'none' || !settings.site) return null;
  if (!settings.allowLocalhost && LOCAL.has(location.hostname)) return null;
  if (settings.respectPrivacySignals !== false && privacySignal()) return null;

  const script = scriptFor(settings);
  if (!script) return null;
  script.addEventListener('load', () => {
    ready = true;
    for (const [name, props] of queue.splice(0)) send(name, props);
  });
  script.addEventListener('error', () => {
    provider = null;
  });
  document.head.appendChild(script);
  provider = settings.provider;
  return provider;
}

function send(name, props) {
  try {
    if (provider === 'goatcounter') {
      // GoatCounter counts events as paths, so the properties go in the title.
      globalThis.goatcounter?.count?.({path: name, title: describe(props), event: true});
    } else if (provider === 'plausible') {
      globalThis.plausible?.(name, {props});
    } else if (provider === 'umami') {
      globalThis.umami?.track?.(name, props);
    }
  } catch {
    // Measurement must never break the map.
  }
}

function describe(props) {
  return Object.entries(props || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
}

/** Records a named event, queued until the provider script is loaded. */
export function track(name, props = {}) {
  if (!provider) return;
  if (!ready) {
    if (queue.length < 20) queue.push([name, props]);
    return;
  }
  send(name, props);
}
