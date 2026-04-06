# Pocket Miner

![Pocket Miner logo](assets/title.png)

Pocket Miner is a browser-based mining game built as a static HTML/CSS/JavaScript project. It does not require a build step, backend, or package install to run.

## How To Play

Each shift drops you into a fresh mine with a time limit. Mine valuable ore, collect what drops, survive until the timer ends, then bank your earnings and spend them on upgrades before the next shift.

Your long-term goal is to dig deeper, carry more loot, and improve your permanent stat bonuses so each shift becomes more productive than the last.

## Player Controls

### Movement And Mining

- `A` or `Left Arrow`: move left
- `D` or `Right Arrow`: move right
- `W` or `Up Arrow`: jump
- `S` or `Down Arrow`: drop down through a platform
- `Space` or `Left Mouse Button`: mine the block under your cursor
- `Q` or `Right Mouse Button`: use the current primary tool at the cursor
- `E`: use the current secondary tool at the cursor
- `Tab`: swap which tool is primary and secondary

At the start of a run, Platform is the primary tool and Bombs are secondary once unlocked. After swapping with `Tab`, `Q` and `Right Mouse Button` follow the tool shown in the left hotbar dial, while `E` follows the tool shown in the right hotbar dial.

### Reward Screen

- `A`/`Left Arrow`/`W`/`Up Arrow`: move reward selection left or up
- `D`/`Right Arrow`/`S`/`Down Arrow`: move reward selection right or down
- `1`, `2`, `3`: choose a reward directly
- `Enter`, `Space`, or `E`: confirm the selected reward

### Other

- `R`: toggle the performance readout
- Intro and pause screens show a 12-character password you can enter later to restore your progress profile

## Shift Flow

1. Start a shift after the `3-2-1-GO!` countdown.
2. Mine blocks within cursor range and collect the ore drops before the shift ends.
3. Open treasure caches when they appear and choose one permanent bonus.
4. Reach the end-of-shift summary and bank your earnings.
5. Visit the store to buy upgrades, then start the next shift.

## Important Gameplay Notes

- Mining is cursor-targeted. You must point at a mineable block within range of the player.
- Ore is not banked just by breaking blocks. You need to actually collect the dropped items.
- Temporary platforms can only be placed within range, in line of sight, and not inside the player.
- Touching magma ends the shift immediately.
- Every new shift generates a fresh world.
- The countdown before each shift means movement does not begin instantly when you leave the intro or summary screens.

## Upgrades And Progression

Store upgrades are split into a few main branches:

- `Tools`: stronger pickaxes for faster mining and one-swing breakpoints
- `Bombs`: dynamite sticks, dynamite bundles, and heavier mining bombs with stronger payloads
- `Storage`: more inventory slots and larger stack sizes
- `Misc`: longer shift duration

Treasure caches grant permanent stat bonuses such as:

- move speed
- jump power
- swing rate
- platform cooldown reduction
- luck
- mastery
- tool damage

## Passwords

The intro screen and pause screen both display a 12-character password in an NES-style grouped format.

Entering a valid password restores your progression profile:

- unlocked upgrade tiers are restored exactly
- round, bank, and permanent bonus values are restored from the password's compressed form

Because the code is limited to 12 human-entered characters, bank and permanent bonuses are rounded to password tiers when restored.

## Tips

- Early on, focus on ore you can collect consistently rather than reaching too deep too fast.
- Storage upgrades matter quickly because uncollected or uncarried value is lost potential income.
- Platform placement is useful for recovering awkward drops and climbing back through mined shafts.
- Permanent cache bonuses compound over time, so treasure rewards are a major part of progression.

## Screenshots

A few in-game screenshots showing gameplay, reward caches and the store.

![First stratum](screenshots/screenshot-first-stratum.png)
![Store screen](screenshots/screenshot-chest.png)
![Reward cache](screenshots/screenshot-powerups.png)

## Optional Cheats

Cheat codes are enabled in the current project build.

- `ROSEBUD`: grants `10000€`
- `MOTHERLODE`: grants `50000€`
- `IDFA`: grants `+50%` to all player bonus stats
- `IDKFA`: grants the `IDFA` stat boost plus a stronger loadout upgrade package

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

## Asset Generation

The runtime terrain atlas used by the renderer is checked in under `assets/tiles/terrain-atlas.png`.

The bomb spritesheet and sound effects are also generated procedurally and checked in under `assets/sprites/bomb-spritesheet.png` and `assets/sfx/`.

Regenerate it after changing tile visuals with:

```powershell
.\generate_tile_assets.ps1
```

Regenerate bomb visuals and bomb audio with:

```powershell
.\generate_bomb_assets.ps1
```

That script writes:

- `assets/tiles/terrain-atlas.png`
- `assets/tiles/terrain-atlas-manifest.json`
- `assets/tiles/terrain-atlas-manifest.js`

The bomb generator writes:

- `assets/sprites/bomb-spritesheet.png`
- `assets/sfx/bomb-fuse.wav`
- `assets/sfx/bomb-explode.wav`

The generator is self-contained and recreates all terrain visuals procedurally, so no separate source tilesheet file is required.
