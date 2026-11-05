/* Site effects layer (progressive enhancement, runs after React hydrates).
 *
 *  - Fluid backdrops (Fluid Core 3.3.0 by KrackedDevs, MIT, fx/vendor/fluid-core):
 *      · home hero: smoky gold behind the hero video, shown while the video loads
 *        or if it can't play; paused once the video is on screen.
 *      · every .cta-band: slow liquid gold under the existing dark band.
 *  - ASCII art (made in the ASCII studio, ascii.krackeddevs.com): the 404 page.
 *
 * Nothing here touches React's markup before hydration: elements are added after
 * the page has loaded, re-checked on client-side navigation, and torn down when
 * React removes their host. If WebGL is unavailable, the original styling stays.
 */

const BRAND = ['#16191c', '#24272b', '#81642f', '#d2b97f']; // charcoal-deep → gold-soft
const HERO_FLUID = { field: 'smoke', colors: BRAND, speed: 0.3, seed: 7 };
const BAND_FLUID = { look: 'MERIDIAN', colors: BRAND, speed: 0.28, seed: 42 };

const CSS = `
.fx-fluid{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.fx-fluid canvas{opacity:0;transition:opacity 1.6s ease}
.fx-fluid.is-ready canvas{opacity:1}
.hero-media>.fx-fluid{z-index:0}
.cta-band>.fx-fluid{z-index:-2}
.cta-band>.fx-fluid.is-ready canvas{opacity:.5}
.cta-band>.fx-fluid:after{content:"";position:absolute;inset:0;
  background:radial-gradient(70% 90% at 50% 50%,oklch(.21 .008 250 / .72),oklch(.21 .008 250 / .35) 75%)}
.fx-ascii{display:block;margin:0 auto clamp(1.25rem,3vw,2rem);max-width:min(100%,1040px);overflow:hidden;
  container-type:inline-size}
.fx-ascii pre{margin:0;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,"Liberation Mono",monospace;
  font-size:.52vw;font-size:calc(100cqi / 167 / .6);line-height:1.12;letter-spacing:0;white-space:pre;
  color:var(--gold-deep,#81642f);text-align:left;user-select:none}
@media (prefers-reduced-motion:no-preference){
  .fx-ascii pre{animation:fx-scan 1.6s steps(22,end) both .15s}
}
@keyframes fx-scan{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
`;

let fluidModule = null;
const loadFluid = () => (fluidModule ||= import('./vendor/fluid-core/src/index.js'));
const mounts = new Map(); // host element -> { art, wrap, cleanup }

function addStyles() {
  if (document.getElementById('fx-styles')) return;
  const s = document.createElement('style');
  s.id = 'fx-styles';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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

async function mountFluid(host, params, { prepend = false, onMount } = {}) {
  if (mounts.has(host)) return;
  mounts.set(host, null); // reserve while the module loads
  const wrap = document.createElement('div');
  wrap.className = 'fx-fluid';
  wrap.setAttribute('aria-hidden', 'true');
  try {
    const { createFluid } = await loadFluid();
    if (!host.isConnected) { mounts.delete(host); return; }
    prepend ? host.prepend(wrap) : host.appendChild(wrap);
    const art = createFluid(wrap, params);
    const entry = { art, wrap, cleanup: [] };
    mounts.set(host, entry);
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('is-ready')));
    onMount?.(entry);
  } catch (err) {
    wrap.remove();
    mounts.delete(host);
    console.warn('[fx] fluid backdrop skipped:', err?.message || err);
  }
}

function unmountGone() {
  for (const [host, entry] of mounts) {
    if (host.isConnected) continue;
    if (entry) {
      entry.cleanup.forEach(fn => fn());
      try { entry.art.destroy(); } catch {}
    }
    mounts.delete(host);
  }
}

/* Hero: fluid sits beneath the two crossfading <video>s. Once a video is actually
   playing (and has had time to fade in) the fluid is paused, since it's covered.
   If a video stalls or errors, the fluid resumes. */
function enhanceHero(media) {
  mountFluid(media, HERO_FLUID, {
    prepend: true,
    onMount(entry) {
      const videos = [...media.querySelectorAll('video')];
      let t = 0;
      const covered = () => videos.some(v => v.classList.contains('is-front') && !v.paused && v.readyState >= 3);
      const sync = () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (covered() || reducedMotion()) entry.art.pause();
          else entry.art.play();
        }, 1500);
      };
      const evs = ['playing', 'pause', 'waiting', 'stalled', 'error', 'emptied'];
      videos.forEach(v => evs.forEach(e => v.addEventListener(e, sync)));
      entry.cleanup.push(() => { clearTimeout(t); videos.forEach(v => evs.forEach(e => v.removeEventListener(e, sync))); });
      sync();
    },
  });
}

let asciiText = null;
const asciiDone = new WeakSet(); // one attempt per section, even if the fetch fails
async function enhanceNotFound(section) {
  const wrap = section.querySelector('.wrap');
  if (!wrap || asciiDone.has(section)) return;
  asciiDone.add(section);
  const fig = document.createElement('div');
  fig.className = 'fx-ascii';
  fig.setAttribute('aria-hidden', 'true');
  wrap.prepend(fig);
  try {
    asciiText ||= fetch('/fx/ascii-house.txt').then(r => (r.ok ? r.text() : Promise.reject(r.status)));
    const pre = document.createElement('pre');
    pre.textContent = await asciiText;
    fig.appendChild(pre);
  } catch {
    fig.remove();
  }
}

function scan() {
  unmountGone();
  const gl = webglOK();
  if (gl) {
    document.querySelectorAll('.hero .hero-media').forEach(enhanceHero);
    document.querySelectorAll('section.cta-band').forEach(el => mountFluid(el, BAND_FLUID));
  }
  document.querySelectorAll('section.notfound').forEach(enhanceNotFound);
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
