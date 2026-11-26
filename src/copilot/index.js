/**
 * Intelligere Copilot - everything it needs lives in this folder.
 *
 *   CopilotLauncher.jsx       floating button + full-screen window (mounted by AppLayout)
 *   buildCopilotDocument.js   puts the original Copilot page together for the iframe
 *   copilotFetch.js           the Copilot's API calls, sent with the app's axios instance
 *   copilotConfig.js          the Copilot API routes, on top of VITE_API_END_POINT
 *   legacy/                   the original Copilot (backend app Ai_Copilot): markup,
 *                             style.css, responsive.css, main.js, logo.png
 *   assets/copilot-icon.png   small copy of the logo for the floating button
 *
 * Changes made to the original, all marked "Intelligere 2.0" in the files:
 *   legacy/index.html   Django tags replaced by placeholders; a Close button
 *                       added in the header (same .header-btn style)
 *   legacy/main.js      loadCompanies() reads the signed-in user's companies
 *                       from the app instead of ai_companies
 */

export { default as CopilotLauncher } from './CopilotLauncher'
