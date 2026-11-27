/**
 * Builds the Copilot page that runs inside the CopilotLauncher's <iframe>.
 *
 * The page is the ORIGINAL Copilot (backend app Ai_Copilot): its markup,
 * style.css, responsive.css and main.js are kept as they were in legacy/,
 * bundled by Vite as plain text and put together here. The only things this
 * file adds are what the Django template used to supply:
 *
 *   - the *_URL constants main.js reads ({% url %} before) - now built from
 *     VITE_API_END_POINT by copilotConfig, so no address is written anywhere
 *   - LOGO_URL ({% static %} before)
 *   - window.COPILOT_HOST: the signed-in user's companies and the company
 *     active in the app, which main.js's loadCompanies() reads
 *
 * plus a few lines of CSS that hide the free-text input bar (hostOverridesCss)
 * and two small scripts of our own around main.js:
 *
 *   before it   a fetch() wrapper: every call to the Copilot APIs is handed to
 *               the app (window.parent), which sends it through the project's
 *               axios instance - same token, headers and timeout as every
 *               other screen. Anything else goes out as a normal fetch.
 *   after it    the Close button, and __copilotApplyHost(), which the app
 *               calls when the company list or the active company changes.
 *
 * Why an iframe: the Copilot's CSS styles :root, *, body, table and
 * [data-theme], and main.js listens on document/window. In its own document
 * none of that can reach Intelligere 2.0, and its media queries see the full
 * screen exactly as they did on the standalone page.
 *
 * This module is loaded with import() only when the Copilot is first opened,
 * so its ~230 KB never weigh on the app's first load.
 */

import mainScript from './legacy/main.js?raw'
import markup from './legacy/index.html?raw'
import responsiveCss from './legacy/responsive.css?raw'
import styleCss from './legacy/style.css?raw'
import logoUrl from './legacy/logo.png?url'
import { COPILOT_HOST_GLOBAL, getCopilotApiRoot, getCopilotUrls } from './copilotConfig'

// A value written inside an inline <script>. JSON is valid JavaScript; "<" is
// escaped so a company called "</script>" can never end the script early.
const toScriptLiteral = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

const absoluteUrl = (url) => new URL(url, window.location.href).href

// Runs BEFORE main.js. Plain ES5-style JS on purpose: it is page text, not
// part of the bundle.
const hostBootstrapScript = (hostData) => `
window.COPILOT_HOST = ${toScriptLiteral(hostData)};
(function () {
  var HOST_GLOBAL = ${toScriptLiteral(COPILOT_HOST_GLOBAL)};
  var apiRoot = window.COPILOT_HOST.apiRoot;
  var nativeFetch = window.fetch.bind(window);

  // Looked up on every call, never cached: the app sets it when the frame is
  // mounted, so it is always the live one.
  function getHost() {
    try {
      return (window.parent && window.parent[HOST_GLOBAL]) || null;
    } catch (e) {
      return null;
    }
  }
  window.__copilotGetHost = getHost;

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
    var host = getHost();
    if (host && url.indexOf(apiRoot) === 0) return host.fetch(url, init || {});
    return nativeFetch(input, init);
  };
})();
`

// Added AFTER the original CSS. Intelligere 2.0 has no free-text input: the
// Copilot is driven by its sidebar and option chips only. The input bar is
// hidden, not removed - main.js binds #chatInput / #sendBtn when it loads.
// The bottom panel then holds just the option chips, so with none on screen
// it is hidden too rather than left as an empty strip. !important: main.js
// shows/hides the panel through its inline style.
const hostOverridesCss = `
.chat-input-bar { display: none !important; }
.chat-input-wrapper:not(:has(.pebble-dock:not(:empty))) { display: none !important; }
`

// Runs AFTER main.js, so main.js's top-level bindings (companies,
// currentCompanyId, currentModuleKey and its functions) are in scope.
const hostBridgeScript = () => `
(function () {
  var closeBtn = document.getElementById("copilotCloseBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      var host = window.__copilotGetHost();
      if (host) host.close();
    });
  }

  // The app calls this when the user's company list or the company active in
  // Intelligere 2.0 changes. A pick made inside the Copilot is kept unless
  // the app's own active company changed or the picked company is gone.
  window.__copilotApplyHost = function (next) {
    var prev = window.COPILOT_HOST || {};
    window.COPILOT_HOST = Object.assign({}, prev, next);
    var list = Array.isArray(next.companies) ? next.companies : [];
    var has = function (id) {
      return id != null && list.some(function (c) { return String(c.id) === String(id); });
    };

    var appCompanyChanged =
      String(next.defaultCompanyId) !== String(prev.defaultCompanyId) && has(next.defaultCompanyId);

    if (appCompanyChanged && String(next.defaultCompanyId) !== String(currentCompanyId)) {
      companies = list;
      if (currentModuleKey) {
        // A module is open: the Copilot's own switch, which re-runs it.
        switchCompany(String(next.defaultCompanyId));
        renderCompanySelect();
      } else {
        currentCompanyId = String(next.defaultCompanyId);
        currentLedger = null;
        renderCompanySelect();
        refreshMostUsed();
      }
      return;
    }

    if (!has(currentCompanyId)) {
      // The company in use is no longer the user's: start over.
      loadCompanies();
      resetAppToDefaultState();
      refreshMostUsed();
      return;
    }

    companies = list;
    renderCompanySelect();
  };
})();
`

/**
 * The full HTML of the Copilot page, for <iframe srcdoc>.
 *
 * @param {{ companies: {id, name}[], defaultCompanyId: number|string|null }} host
 */
export const buildCopilotDocument = ({ companies, defaultCompanyId }) => {
  if (/<\/script/i.test(mainScript)) {
    // Would end the inline <script> early. Not the case today; fail loudly
    // rather than show a half-working Copilot if a future copy brings one.
    throw new Error('[Copilot] legacy/main.js contains "</script" and cannot be inlined.')
  }

  const logo = absoluteUrl(logoUrl)
  const apiRoot = getCopilotApiRoot()

  const urlConstants = Object.entries({ ...getCopilotUrls(), LOGO_URL: logo })
    .map(([name, url]) => `const ${name} = ${toScriptLiteral(url)};`)
    .join('\n')

  const styles = [styleCss, responsiveCss, hostOverridesCss]
    .map((css) => `<style>\n${css}\n</style>`)
    .join('\n  ')

  const scripts = [
    `<script>${hostBootstrapScript({ apiRoot, companies, defaultCompanyId })}</script>`,
    `<script>\n${urlConstants}\n</script>`,
    `<script>\n${mainScript}\n</script>`,
    `<script>${hostBridgeScript()}</script>`,
  ].join('\n  ')

  // Function replacers: the inserted text may contain "$&" and friends,
  // which a plain replacement string would expand.
  return markup
    .replaceAll('__COPILOT_LOGO_URL__', () => logo)
    .replace('<!--COPILOT_STYLES-->', () => styles)
    .replace('<!--COPILOT_SCRIPTS-->', () => scripts)
}
