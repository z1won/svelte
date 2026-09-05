# InstaSave

Svelte + Vite mobile web app for extracting a preview image from a public Instagram post and saving it.

## Stack

- Svelte
- Vite
- GitHub Pages
- Microlink metadata API for server-side page metadata lookup

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The Vite base path is configured for the project site: `/svelte/`.

## Scope

The app targets public Instagram posts/reels and does not attempt to bypass login, private-account restrictions, anti-bot controls, or other access controls. Use it only for content you are permitted to save.

The extraction layer uses Microlink because a GitHub Pages browser cannot reliably fetch Instagram page HTML directly due to cross-origin/access restrictions. The free Microlink endpoint has usage limits, so it is intended for low-volume personal use rather than a production-scale downloader.
