# Gallery

A 2D browser gallery where visitors pick a character and walk through a space to explore paintings. Built with Vue 3, TypeScript, GSAP, and Vite.

## Features

- **Character select** — choose from four characters (cat, dog, alien, rock) with an animated portal entrance
- **2D gallery scene** — top-down map loaded from a CSV, with floor tiles, wall tiles, paintings, and floor items
- **Movement** — WASD / arrow keys, click-to-move on desktop; drag-to-move on mobile
- **Paintings** — click any painting to view it up close in a modal
- **Wall actions** — About popup, external links, and an Exit button
- **NPCs** — visitors wander the space using BFS pathfinding
- **Thank you screen** — shown on exit, with the selected character walking in

## Built With

- **Vue 3** — UI framework, component structure, and reactive state
- **TypeScript** — type safety across all components and game logic
- **GSAP** — all animations and the per-frame RAF game loop
- **Vite** — dev server and production build
- **Tiled** — map editor used to design and export `map-data.csv`
- **Claude.ai** — AI assistant used throughout development

## Project structure

```
src/
  components/
    CharacterSelect.vue   # opening screen
    GalleryScene.vue      # main 2D game scene
    PaintingModal.vue     # full-screen painting viewer
    ThankYou.vue          # exit screen
  App.vue
  main.ts
public/
  map-data.csv            # grid layout — cell values control tile type and content
  *.webp / *.GIF          # character sprites, visitor sprites, map tiles, paintings
```

## Map cell values

| Value         | Tile                                 |
| ------------- | ------------------------------------ |
| `-1`          | empty (hidden)                       |
| `0`           | wall left                            |
| `1`           | wall center                          |
| `2`           | wall right                           |
| `3`           | floor (spawn point)                  |
| `4`           | floor                                |
| `4-N`         | floor + item overlay (`item-N.webp`) |
| `100-N`       | wall left + painting N               |
| `101-N`       | wall center + painting N             |
| `102-N`       | wall right + painting N              |
| `100-about`   | About action                         |
| `101-links`   | Links action                         |
| `102-exit`    | Exit action                          |
| `101-welcome` | centred welcome text                 |
| `101-intro`   | left-aligned instruction text        |

## Setup

```sh
npm install
```

```sh
npm run dev       # development server
npm run build     # type-check + production build
npm run preview   # preview production build
```
