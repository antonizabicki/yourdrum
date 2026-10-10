# YOURDRUM public beta website

Website: https://yourdrum.what-is-next.vip

Static marketing website, interactive audio demo and beta download page. The site runs on Cloudflare Pages; installers and manual VST3 archives are published in the GitHub release `v1.0.0-beta`.

Cloudflare is connected directly to this repository. Each push to `main` validates the site and publishes the `site/` directory. Pull requests use preview deployments. GitHub Actions also checks references and release metadata.

## Preview and deploy

```sh
python3 scripts/check-site.py
python3 -m http.server 8765 --directory site
npx wrangler@4.149.0 pages deploy site --project-name=yourdrum --branch=main
```

The four download routes in `site/_redirects` point to the corresponding release assets. Do not commit installer binaries to the website or upload them to Pages. `site/beta/beta-downloads.json`, `site/assets/beta-data.js` and `site/beta/downloads/SHA256SUMS.txt` describe the release payloads.

## Beta status

Both original plugin binaries report version 1.0.0 and are unchanged. Windows supports Windows 10/11 x64; macOS supports 15.2+ on Apple Silicon and Intel. VST3 instrument only. No Audio Unit is included.

The installers are unsigned and the macOS package is not notarized. The macOS VST3 validator passed 46 tests and failed one: the first factory preset has no name. The Windows installer still needs an installation and DAW test on Windows x64. These limits are explained on the download page. The planned $2 full release has no checkout in this beta.

Plugin source code is not part of this repository. Typeface licenses are in `site/assets/licenses/`.
