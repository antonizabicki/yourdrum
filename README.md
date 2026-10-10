# YOURDRUM official release website

Website: https://yourdrum.what-is-next.vip

Static marketing website, interactive audio demo and system requirements/installation guide. Purchases and product delivery use Gumroad. Cloudflare Pages publishes the `site/` directory after every validated push to `main`; GitHub Actions also validates the site.

## Gumroad product URL

The current destination is the general Gumroad homepage, as requested by the owner until the listing is ready. Set the actual product URL in `site/assets/store.js` (`YOURDRUM_GUMROAD_URL`). This updates all five purchase links in the browser. Also update their static `href` fallbacks if no-JavaScript support is needed. `data-gumroad` marks every purchase link.

## Preview and deploy

```sh
python3 scripts/check-site.py
node --check site/assets/app.js
node --check site/assets/store.js
python3 -m http.server 8765 --directory site
```

Push to `main` to deploy through the existing Cloudflare GitHub integration. The old `/beta` and `/beta/*` routes redirect permanently to `/buy/`. Public installer download routes and catalogs have been removed from the site. Product binaries belong in the Gumroad purchase content, not the public website repository or Pages assets.

## Product requirements

YOURDRUM 1.0.0 is a VST3 instrument. Windows requires Windows 10/11 x64; macOS requires 15.2+ and supports Apple Silicon and Intel. A VST3-compatible DAW is required. No Audio Unit or standalone application is included.

The plugin binaries are unchanged. Installers are unsigned and the macOS package is not notarized. The first macOS factory preset can appear unnamed; 32-bit floating-point audio processing is supported. Native Windows installation and DAW testing remain pending. These implementation facts are independent of the official-release branding; plugin source code was not available for a rebuild.

Typeface licenses are in `site/assets/licenses/`.
