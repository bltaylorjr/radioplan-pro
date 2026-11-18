// Where the app lives online. The online app, its content packs and the intro video are on Cloudflare Pages
// (account lvplanpro); the installers are GitHub Releases of lvplanpro/lvplan-pro (see update.ts).
export const ONLINE_URL = 'https://lvplan-pro.pages.dev/';
/** The GitHub Pages address used before the move to the new accounts (works only while that repository is public). */
export const OLD_ONLINE_URL = 'https://bltaylorjr.github.io/radioplan-pro/';
/** Videos too large for Cloudflare Pages (25 MiB per file) are also attached to every release. */
export const releaseFileUrl = (file: string) => `https://github.com/lvplanpro/lvplan-pro/releases/latest/download/${file}`;
