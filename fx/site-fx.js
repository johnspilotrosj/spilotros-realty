/* Site effects layer (progressive enhancement, runs after React hydrates).
 *
 * Fluid backdrop (Fluid Core 3.3.0 by KrackedDevs, MIT, fx/vendor/fluid-core)
 * behind the Contact page's dark "Let's talk about your move." section: a slow
 * liquid-gold layer under a charcoal scrim. Everything else is left untouched.
 *
 * Nothing here touches React's markup before hydration: elements are added after
 * the page has loaded, re-checked on client-side navigation, and torn down when
 * React removes their host. If WebGL is unavailable, the original styling stays.
 */

const BRAND = ['#16191c', '#24272b', '#81642f', '#d2b97f']; // charcoal-deep → gold-soft
const CONTACT_FLUID = { look: 'MERIDIAN', colors: BRAND, speed: 0.28, seed: 42 };
const HOSTS = 'section#contact.section-dark';

const CSS = `
${HOSTS}{position:relative;isolation:isolate}
.fx-fluid{position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden}
.fx-fluid canvas{opacity:0;transition:opacity 1.6s ease}
.fx-fluid.is-ready canvas{opacity:.55}
.fx-fluid:after{content:"";position:absolute;inset:0;
  background:linear-gradient(90deg,oklch(.21 .008 250 / .78),oklch(.21 .008 250 / .5) 55%,oklch(.21 .008 250 / .3))}
@media (max-width:900px){
  .fx-fluid:after{background:linear-gradient(180deg,oklch(.21 .008 250 / .78),oklch(.21 .008 250 / .45))}
}
`;

let fluidModule = null;
const loadFluid = () => (fluidModule ||= import('./vendor/fluid-core/src/index.js'));
const mounts = new Map(); // host element -> FluidMount (null while loading)

function addStyles() {
  if (document.getElementById('fx-styles')) return;
  const s = document.createElement('style');
  s.id = 'fx-styles';
  s.textContent = CSS;
  document.head.appendChild(s);
}

let glSupport = null; // probe once: every probe creates a GL context
function webglOK() {
  if (glSupport === null) {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      glSupport = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { glSupport = false; }
  }
  return glSupport;
}

async function mountFluid(host, params) {
  if (mounts.has(host)) return;
  mounts.set(host, null); // reserve while the module loads
  const wrap = document.createElement('div');
  wrap.className = 'fx-fluid';
  wrap.setAttribute('aria-hidden', 'true');
  try {
    const { createFluid } = await loadFluid();
    if (!host.isConnected) { mounts.delete(host); return; }
    host.appendChild(wrap);
    mounts.set(host, createFluid(wrap, params));
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('is-ready')));
  } catch (err) {
    wrap.remove();
    mounts.delete(host);
    console.warn('[fx] fluid backdrop skipped:', err?.message || err);
  }
}

function unmountGone() {
  for (const [host, art] of mounts) {
    if (host.isConnected) continue;
    try { art?.destroy(); } catch {}
    mounts.delete(host);
  }
}

function scan() {
  unmountGone();
  if (!webglOK()) return;
  document.querySelectorAll(HOSTS).forEach(el => mountFluid(el, CONTACT_FLUID));
}

function start() {
  addStyles();
  scan();
  const root = document.getElementById('root') || document.body;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  }).observe(root, { childList: true, subtree: true });
}

/* Wait for load + an idle moment so React has finished hydrating first. */
const idle = cb => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 400));
if (document.readyState === 'complete') idle(start);
else window.addEventListener('load', () => idle(start), { once: true });
