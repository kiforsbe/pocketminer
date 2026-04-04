# Pocket Miner

Pocket Miner is a browser-based mining game built as a static HTML/CSS/JavaScript project. It does not require a build step, backend, or package install to run.

## Play Online

This repository is now set up to deploy directly to GitHub Pages.

### GitHub Pages

1. Push this repository to GitHub.
2. In the repository settings, open `Pages`.
3. Set the source to `GitHub Actions`.
4. Push to `main` and the workflow in `.github/workflows/deploy-pages.yml` will publish the game.

Because the project uses only relative asset paths like `./assets/...`, it also works on other static hosts such as:

- GitHub Pages
- Netlify
- Cloudflare Pages
- Vercel static hosting
- any simple web server

## Local Run

Open the repository from a local web server rather than double-clicking `index.html`, because modern browsers restrict module loading and audio/file fetches from the `file` protocol.

Examples:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Hosting Notes

- Keep asset filenames and letter casing exactly as they are in the repository. Linux-based hosts are case-sensitive.
- The intro title art is expected at `./assets/title.png` if you want a custom title image. If that file is missing, the game falls back to the text title automatically.
- The project is a static site, so no bundler or transpiler is required for deployment.