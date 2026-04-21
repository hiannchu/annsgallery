<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import gsap from 'gsap'
import PaintingModal from './PaintingModal.vue'

const props = defineProps<{
  character: { id: string; static: string; walking: string }
}>()

// ─── Constants ────────────────────────────────────────────────────────────────
const TILE_SIZE = 212
const CHAR_W    = 172.8
const CHAR_H    = 241.6
const SPEED     = 8  // px per frame

// ─── Paintings ────────────────────────────────────────────────────────────────
// Paintings are discovered from the map CSV — no static list needed.
// Cell values 100-X, 101-X, 102-X encode both the wall tile type and the
// painting filename (e.g. "painting-100-1.webp").
type Painting = { id: string; col: number; row: number; src: string; title: string }
const paintings = ref<Painting[]>([])

// ─── Wall texts ───────────────────────────────────────────────────────────────
// Special cells that show text instead of a painting.
// '101-welcome' → centred "Welcome" | '101-intro' → left-aligned instructions
const WALL_TEXT_CELLS: Record<string, { text: string; align: 'center' | 'left' }> = {
  '101-welcome': { text: 'Welcome', align: 'center' },
  '101-intro':   { text: 'Use WASD / arrow keys or drag to move.\n\nClick a painting to view it up close.', align: 'left'},
}
type WallText = { id: string; col: number; row: number; text: string; align: 'center' | 'left' }
const wallTexts = ref<WallText[]>([])

// ─── Wall actions ─────────────────────────────────────────────────────────────
// Interactive cells — about popup, external link, exit.
const WALL_ACTION_CELLS = new Set(['100-about', '101-links', '102-exit'])
type WallActionType = 'about' | 'links' | 'exit'
type WallAction = { id: string; col: number; row: number; type: WallActionType }
const wallActions = ref<WallAction[]>([])
const showAboutModal = ref(false)

const emit = defineEmits<{ exit: [] }>()

function onWallActionClick(type: WallActionType) {
  if (type === 'about') {
    showAboutModal.value = true
  } else if (type === 'links') {
    window.open('https://linktr.ee/ann.chu.creator', '_blank')
  } else if (type === 'exit') {
    emit('exit')
  }
}

// ─── Floor variants ───────────────────────────────────────────────────────────
// Each floor cell gets a random variant (1–3) assigned once on load so the
// floor looks natural without changing on every re-render.
const floorVariants = ref<number[][]>([])

// ─── Floor items ──────────────────────────────────────────────────────────────
// Cells like '4-1', '4-2', '4-3' render as floor tiles but also display an
// item image on top. They remain walkable.
type FloorItem = { id: string; col: number; row: number; src: string }
const floorItems = ref<FloorItem[]>([])

// ─── Visitors (NPCs) ──────────────────────────────────────────────────────────
// Visitors wander randomly between walkable cells. They are purely decorative —
// no collision with the player. All position updates go directly to the DOM
// (same pattern as the player character) to avoid per-frame reactive overhead.
const VISITOR_W = CHAR_W * 0.85   // ~147 px — slightly smaller than the player
const VISITOR_H = CHAR_H * 0.85   // ~205 px

const VISITOR_STYLES = [1, 2, 3] as const
type VisitorStyle = typeof VISITOR_STYLES[number]

type Visitor = {
  x: number; y: number
  destX: number; destY: number
  speed: number
  moving: boolean
  facingRight: boolean
  pauseUntil: number                      // timestamp — visitor stays idle until this time
  path: { x: number; y: number }[]       // remaining BFS waypoints to current goal
  style: VisitorStyle                     // which visitor sprite set to use
}

const visitors: Visitor[] = []        // plain array — mutated each frame
const visitorStyles = ref<VisitorStyle[]>([])  // reactive for template v-for + initial src
const visitorEls    = ref<(HTMLElement | null)[]>([])
let   walkableCells: { x: number; y: number }[] = []

// ─── Map state ────────────────────────────────────────────────────────────────
// Stored as strings so mixed values like "100-1" are preserved.
const mapGrid = ref<string[][]>([])
const mapCols = computed(() => mapGrid.value[0]?.length ?? 0)
const mapRows = computed(() => mapGrid.value.length)
const stageW  = computed(() => mapCols.value * TILE_SIZE)
const stageH  = computed(() => mapRows.value * TILE_SIZE)

// ─── Character (DOM-driven — no reactive overhead per frame) ──────────────────
const charEl  = ref<HTMLElement | null>(null)
// Plain object intentionally — animated by GSAP and the RAF loop directly.
const charPos = { x: 0, y: 0 }
let moveTween: gsap.core.Tween | null = null

// ─── Walking state (only used for src swap — changes rarely) ──────────────────
const isMoving = ref(false)
function setMoving(val: boolean) {
  if (isMoving.value !== val) isMoving.value = val
}

// ─── Camera ───────────────────────────────────────────────────────────────────
// Deadzone camera: character moves freely across the screen; the map only
// scrolls when the character gets near an edge.
// The margin is capped at 40 % of each viewport dimension so the left/right
// (or top/bottom) triggers can never overlap on narrow mobile screens.
const SCROLL_MARGIN_MAX = 320   // px — upper bound on desktop

// Plain object — written every frame directly by updateCamera().
const camera = { x: 0, y: 0 }

function updateCamera() {
  const mx = Math.min(SCROLL_MARGIN_MAX, Math.floor(window.innerWidth  * 0.4))
  const my = Math.min(SCROLL_MARGIN_MAX, Math.floor(window.innerHeight * 0.4))

  const sx = charPos.x - camera.x   // character's current screen X
  const sy = charPos.y - camera.y   // character's current screen Y

  if (sx < mx)                         camera.x = charPos.x - mx
  if (sx > window.innerWidth  - mx)    camera.x = charPos.x - (window.innerWidth  - mx)
  if (sy < my)                         camera.y = charPos.y - my
  if (sy > window.innerHeight - my)    camera.y = charPos.y - (window.innerHeight - my)

  // Clamp so the map never scrolls past its own edges.
  camera.x = Math.max(0, Math.min(stageW.value - window.innerWidth,  camera.x))
  camera.y = Math.max(0, Math.min(stageH.value - window.innerHeight, camera.y))
}

function applyCamera() {
  const el = stageRef.value
  if (!el) return
  el.style.left = `${-camera.x}px`
  el.style.top  = `${-camera.y}px`
}

function applyCharDOM() {
  const el = charEl.value
  if (!el) return
  el.style.left   = `${charPos.x - CHAR_W / 2}px`
  el.style.top    = `${charPos.y - CHAR_H / 2}px`
  el.style.zIndex = `${Math.floor(charPos.y)}`
  updateCamera()
  applyCamera()
}

function setCharFacing(dx: number) {
  const el = charEl.value
  if (!el || dx === 0) return
  el.style.transform = `scaleX(${dx > 0 ? 1 : -1})`
}

// ─── Cell helpers ─────────────────────────────────────────────────────────────
// Extracts the leading number from a cell string.
// '4' → 4 | '-1' → -1 | '100-1' → 100 | '101-3' → 101
function cellBase(cell: string): number {
  // Skip index 0 when looking for '-' so the sign of '-1' isn't mistaken for a separator.
  const sep = cell.indexOf('-', 1)
  return sep !== -1 ? parseInt(cell.slice(0, sep), 10) : parseInt(cell, 10)
}

function isCellWalkable(cell: string): boolean {
  const b = cellBase(cell)
  return b === 3 || b === 4
}

// Returns the :class object for a tile element.
function tileCssClass(cell: string): Record<string, boolean> {
  const b = cellBase(cell)
  return {
    'map-floor-1':       b === 3 || b === 4,
    'map-wall-left':   b === 0 || b === 100,
    'map-wall-center': b === 1 || b === 101,
    'map-wall-right':  b === 2 || b === 102,
  }
}

// ─── Visitor helpers ──────────────────────────────────────────────────────────

// BFS from (startCol, startRow) to (endCol, endRow).
// Returns an ordered list of world-space tile centres to walk through,
// NOT including the starting tile but INCLUDING the goal tile.
function bfsPath(
  startCol: number, startRow: number,
  endCol: number,   endRow: number,
): { x: number; y: number }[] {
  if (startCol === endCol && startRow === endRow) return []
  const rows = mapGrid.value.length
  const cols = mapGrid.value[0]?.length ?? 0
  const key  = (c: number, r: number) => `${c},${r}`

  const parent = new Map<string, string | null>()
  parent.set(key(startCol, startRow), null)
  const queue: [number, number][] = [[startCol, startRow]]

  let found = false
  outer:
  while (queue.length > 0) {
    const [col, row] = queue.shift()!
    for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
      const nc = col + dc, nr = row + dr
      const k  = key(nc, nr)
      if (parent.has(k)) continue
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      if (!isCellWalkable((mapGrid.value[nr] ?? [])[nc] ?? '-1')) continue
      parent.set(k, key(col, row))
      if (nc === endCol && nr === endRow) { found = true; break outer }
      queue.push([nc, nr])
    }
  }

  if (!found) return []

  // Reconstruct path from goal back to start, then reverse.
  const path: { x: number; y: number }[] = []
  let cur = key(endCol, endRow)
  while (cur !== key(startCol, startRow)) {
    const [c, r] = cur.split(',').map(Number) as [number, number]
    path.push({ x: c * TILE_SIZE + TILE_SIZE / 2, y: r * TILE_SIZE + TILE_SIZE / 2 })
    cur = parent.get(cur)!
  }
  path.reverse()
  return path
}

function spawnVisitors() {
  // Build a lookup of all walkable tile centres (world-space).
  walkableCells = []
  for (let r = 0; r < mapGrid.value.length; r++) {
    const row = mapGrid.value[r] ?? []
    for (let c = 0; c < row.length; c++) {
      if (isCellWalkable(row[c]!)) {
        walkableCells.push({
          x: c * TILE_SIZE + TILE_SIZE / 2,
          y: r * TILE_SIZE + TILE_SIZE / 2,
        })
      }
    }
  }
  if (walkableCells.length === 0) return

  visitors.length = 0
  // One of each style guaranteed, then random extras — cap at 15 total.
  const extra = Math.floor(Math.random() * (15 - VISITOR_STYLES.length + 1))  // 0–12
  const count = VISITOR_STYLES.length + extra

  // Build the style list: one of each, then random fills.
  const styles: VisitorStyle[] = [...VISITOR_STYLES]
  for (let i = VISITOR_STYLES.length; i < count; i++) {
    styles.push(VISITOR_STYLES[Math.floor(Math.random() * VISITOR_STYLES.length)]!)
  }
  // Shuffle so the guaranteed ones aren't always first.
  for (let i = styles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [styles[i], styles[j]] = [styles[j]!, styles[i]!]
  }
  visitorStyles.value = styles

  for (let i = 0; i < count; i++) {
    const cell = walkableCells[Math.floor(Math.random() * walkableCells.length)]!
    visitors.push({
      x: cell.x, y: cell.y,
      destX: cell.x, destY: cell.y,
      speed:       1.6 + Math.random() * 1.4,
      moving:      false,
      facingRight: Math.random() > 0.5,
      pauseUntil:  Date.now() + Math.random() * 3000,
      path:        [],
      style:       styles[i]!,
    })
  }
}

function tickVisitors(now: number) {
  for (let i = 0; i < visitors.length; i++) {
    const v  = visitors[i]!
    const el = visitorEls.value[i]
    if (!el) continue

    // Idle → compute a BFS path to a random distant destination.
    // Visitors walk the full path without stopping between waypoints,
    // then pause at the goal before choosing the next one.
    if (!v.moving && now >= v.pauseUntil && walkableCells.length > 0) {
      const dest     = walkableCells[Math.floor(Math.random() * walkableCells.length)]!
      const startCol = Math.floor(v.x / TILE_SIZE)
      const startRow = Math.floor(v.y / TILE_SIZE)
      const endCol   = Math.floor(dest.x / TILE_SIZE)
      const endRow   = Math.floor(dest.y / TILE_SIZE)
      v.path = bfsPath(startCol, startRow, endCol, endRow)
      if (v.path.length > 0) {
        const next = v.path.shift()!
        v.destX  = next.x
        v.destY  = next.y
        v.moving = true
      }
    }

    if (v.moving) {
      const dx   = v.destX - v.x
      const dy   = v.destY - v.y
      const dist = Math.hypot(dx, dy)

      if (dist <= v.speed) {
        // Snapped to waypoint — advance to next or finish the journey.
        v.x = v.destX; v.y = v.destY
        if (v.path.length > 0) {
          // Continue along the path without pausing.
          const next = v.path.shift()!
          v.destX = next.x
          v.destY = next.y
        } else {
          // Reached the final goal — idle for 2–6 s before wandering again.
          v.moving     = false
          v.pauseUntil = now + 2000 + Math.random() * 4000
        }
      } else {
        v.x += (dx / dist) * v.speed
        v.y += (dy / dist) * v.speed
        v.facingRight = dx > 0
      }
    }

    // Apply position / depth directly to the DOM.
    el.style.left      = `${v.x - VISITOR_W / 2}px`
    el.style.top       = `${v.y - VISITOR_H / 2}px`
    el.style.zIndex    = `${Math.floor(v.y)}`
    el.style.transform = `scaleX(${v.facingRight ? 1 : -1})`

    // Swap still ↔ walking image only when state changes (avoids URL churn).
    const state = v.moving ? 'walking' : 'static'
    if (el.dataset['visitorState'] !== state) {
      el.dataset['visitorState'] = state
      const img = el.querySelector('img') as HTMLImageElement | null
      if (img) img.src = v.moving ? `/visitor-${v.style}.GIF` : `/visitor-${v.style}.webp`
    }
  }
}

// ─── Map loading ──────────────────────────────────────────────────────────────
async function loadMap() {
  const res  = await fetch('/map-data.csv')
  const text = await res.text()

  // Keep cells as strings — values like "100-1" must not be parsed to integers.
  mapGrid.value = text
    .trim()
    .split('\n')
    .map(row => row.split(',').map(v => v.trim()))

  // Assign a random floor texture (1–3) to every floor cell once at load time.
  floorVariants.value = mapGrid.value.map(row =>
    row.map(cell => {
      const b = cellBase(cell)
      return (b === 3 || b === 4) ? Math.ceil(Math.random() * 3) : 0
    })
  )

  // Find starting point (base === 3) or fall back to map centre.
  let startCol = Math.floor((mapGrid.value[0]?.length ?? 0) / 2)
  let startRow = Math.floor(mapGrid.value.length / 2)
  outer:
  for (let r = 0; r < mapGrid.value.length; r++) {
    const row = mapGrid.value[r] ?? []
    for (let c = 0; c < row.length; c++) {
      if (cellBase(row[c]!) === 3) { startCol = c; startRow = r; break outer }
    }
  }
  charPos.x = startCol * TILE_SIZE + TILE_SIZE / 2
  charPos.y = startRow * TILE_SIZE + TILE_SIZE / 2

  // Set initial camera so the character appears near the bottom-left of the viewport.
  const INIT_PAD_LEFT   = 180
  const INIT_PAD_BOTTOM = 180
  camera.x = charPos.x - INIT_PAD_LEFT
  camera.y = charPos.y - (window.innerHeight - INIT_PAD_BOTTOM)
  camera.x = Math.max(0, Math.min(stageW.value - window.innerWidth,  camera.x))
  camera.y = Math.max(0, Math.min(stageH.value - window.innerHeight, camera.y))

  // Discover paintings from cells whose base is 100, 101, or 102.
  // Cell value encodes both wall type and painting filename, e.g. "101-2"
  // → wall-center tile + /painting-101-2.webp
  paintings.value   = []
  wallTexts.value   = []
  wallActions.value = []
  floorItems.value  = []
  for (let r = 0; r < mapGrid.value.length; r++) {
    const row = mapGrid.value[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!
      const b    = cellBase(cell)
      if (b === 4 && cell.indexOf('-', 1) !== -1) {
        // Floor item: '4-1' → floor tile + item-1.webp, un-walkable
        const itemNum = cell.split('-')[1]
        floorItems.value.push({ id: cell, col: c, row: r, src: `/item-${itemNum}.webp` })
      } else if (b === 100 || b === 101 || b === 102) {
        if (WALL_ACTION_CELLS.has(cell)) {
          const type = cell.split('-')[1] as WallActionType
          wallActions.value.push({ id: cell, col: c, row: r, type })
        } else {
          const wt = WALL_TEXT_CELLS[cell]
          if (wt) {
            wallTexts.value.push({ id: cell, col: c, row: r, text: wt.text, align: wt.align })
          } else {
            paintings.value.push({
              id:    cell,
              col:   c,
              row:   r,
              src:   `/painting-${cell}.webp`,
              title: `Painting ${cell}`,
            })
          }
        }
      }
    }
  }

  spawnVisitors()

  await nextTick()
  applyCharDOM()   // also calls applyCamera() to set initial stage position

  // Apply initial visitor positions now that their DOM elements exist.
  for (let i = 0; i < visitors.length; i++) {
    const el = visitorEls.value[i]
    if (!el) continue
    const v = visitors[i]!
    el.style.left      = `${v.x - VISITOR_W / 2}px`
    el.style.top       = `${v.y - VISITOR_H / 2}px`
    el.style.zIndex    = `${Math.floor(v.y)}`
    el.style.transform = `scaleX(${v.facingRight ? 1 : -1})`
  }
}

// ─── Walkability ──────────────────────────────────────────────────────────────
function cellAt(px: number, py: number): string {
  const c = Math.floor(px / TILE_SIZE)
  const r = Math.floor(py / TILE_SIZE)
  if (r < 0 || r >= mapGrid.value.length) return '-1'
  if (c < 0 || c >= (mapGrid.value[0]?.length ?? 0)) return '-1'
  return mapGrid.value[r]?.[c] ?? '-1'
}

function isWalkable(px: number, py: number): boolean {
  const m = CHAR_W / 2 - 6   // horizontal collision margin
  // Bottom sensors are pushed toward the feet so the character stops
  // before their sprite visually overlaps the wall tile below.
  // Top sensors stay near centre for tight north-wall detection.
  return (
    isCellWalkable(cellAt(px - m, py + 80)) &&
    isCellWalkable(cellAt(px + m, py + 80)) &&
    isCellWalkable(cellAt(px - m, py - 4)) &&
    isCellWalkable(cellAt(px + m, py - 4))
  )
}

// ─── Keyboard movement ────────────────────────────────────────────────────────
const keys = new Set<string>()
let rafId = 0

function onKeyDown(e: KeyboardEvent) {
  const dirs = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D']
  if (dirs.includes(e.key)) {
    e.preventDefault()
    moveTween?.kill()
    moveTween = null
  }
  keys.add(e.key)
}
function onKeyUp(e: KeyboardEvent) { keys.delete(e.key) }

function tick() {
  let dx = 0, dy = 0
  if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) dx -= 1
  if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) dx += 1
  if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) dy -= 1
  if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) dy += 1

  dx += touchDragDx
  dy += touchDragDy

  if (dx !== 0 || dy !== 0) {
    setMoving(true)
    const len = Math.sqrt(dx * dx + dy * dy)
    const vx  = (dx / len) * SPEED
    const vy  = (dy / len) * SPEED
    const nx  = charPos.x + vx
    const ny  = charPos.y + vy

    if (isWalkable(nx, ny)) {
      charPos.x = nx; charPos.y = ny
    } else if (isWalkable(nx, charPos.y)) {
      charPos.x = nx
    } else if (isWalkable(charPos.x, ny)) {
      charPos.y = ny
    }

    setCharFacing(dx)
    applyCharDOM()
  } else if (!moveTween) {
    setMoving(false)
  }

  tickVisitors(Date.now())
  rafId = requestAnimationFrame(tick)
}

// ─── Click to move (desktop) ──────────────────────────────────────────────────
const stageRef = ref<HTMLElement | null>(null)

function getEventPos(e: MouseEvent): { x: number; y: number } | null {
  if (!stageRef.value) return null
  const rect = stageRef.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function moveToPoint(tx: number, ty: number) {
  if (!isWalkable(tx, ty)) return
  const dx   = tx - charPos.x
  const dy   = ty - charPos.y
  const dist = Math.hypot(dx, dy)
  if (dist < 4) return

  setCharFacing(dx)
  setMoving(true)
  moveTween?.kill()
  moveTween = gsap.to(charPos, {
    x: tx,
    y: ty,
    duration: dist / 200,
    ease: 'power1.inOut',
    onUpdate:  applyCharDOM,
    onComplete: () => { moveTween = null; setMoving(false) },
  })
}

let lastTouchEndTime = 0

function onStageClick(e: MouseEvent) {
  if (Date.now() - lastTouchEndTime < 500) return  // ignore ghost click after touchend
  const pos = getEventPos(e)
  if (pos) moveToPoint(pos.x, pos.y)
}

// ─── Drag to move (mobile) ────────────────────────────────────────────────────
// Finger origin is fixed at touch start; dragging away from it sets direction
// and speed (analog: full speed once finger is DRAG_MAX px from origin).
const DRAG_MIN = 10   // px — dead zone before movement starts
const DRAG_MAX = 60   // px — distance at which full speed is reached

let touchDragDx  = 0
let touchDragDy  = 0
let touchOriginX = 0
let touchOriginY = 0

function onStageTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return
  touchOriginX = touch.clientX
  touchOriginY = touch.clientY
  touchDragDx  = 0
  touchDragDy  = 0
  moveTween?.kill()
  moveTween = null
}

function onStageTouchMove(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return
  const dx   = touch.clientX - touchOriginX
  const dy   = touch.clientY - touchOriginY
  const dist = Math.hypot(dx, dy)
  if (dist < DRAG_MIN) {
    touchDragDx = 0
    touchDragDy = 0
    return
  }
  const scale = Math.min((dist - DRAG_MIN) / (DRAG_MAX - DRAG_MIN), 1)
  touchDragDx = (dx / dist) * scale
  touchDragDy = (dy / dist) * scale
}

function onStageTouchEnd() {
  lastTouchEndTime = Date.now()
  touchDragDx = 0
  touchDragDy = 0
}

// ─── Painting interaction ─────────────────────────────────────────────────────
const paintingEls    = ref<(HTMLElement | null)[]>([])
const activePainting = ref<Painting | null>(null)

function onPaintingEnter(idx: number) {
  const el = paintingEls.value[idx]
  if (!el) return
  gsap.to(el, { scale: 1.1, duration: 0.3, ease: 'power2.out' })
  gsap.fromTo(el,
    { filter: 'drop-shadow(0 0 0px rgba(255, 210, 70, 0))' },
    { filter: 'drop-shadow(0 0 16px rgba(255, 210, 70, 0.9))', duration: 0.4, ease: 'power2.out' },
  )
}

function onPaintingLeave(idx: number) {
  const el = paintingEls.value[idx]
  if (!el) return
  gsap.to(el, { scale: 1, duration: 0.3, ease: 'power2.out' })
  gsap.fromTo(el,
    { filter: 'drop-shadow(0 0 16px rgba(255, 210, 70, 0.9))' },
    { filter: 'drop-shadow(0 0 0px rgba(255, 210, 70, 0))', duration: 0.4, ease: 'power2.out' },
  )
}

function onPaintingClick(painting: Painting, e: Event) {
  e.stopPropagation()
  activePainting.value = painting
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadMap()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup',   onKeyUp)

  // Entrance: character walks in from off-screen left into the scene.
  // The RAF game loop starts only after the animation completes so the
  // player can't move during the entrance.
  const el = charEl.value
  if (el) {
    setMoving(true)
    gsap.set(el, { scaleX: 1 })           // face right while walking in
    gsap.from(el, {
      x: -(camera.x + CHAR_W + 20),       // start just off the left edge of the viewport
      duration: 1.6,
      ease: 'power2.out',
      onComplete: () => {
        gsap.set(el, { x: 0 })            // hand transform back to the game loop cleanly
        setMoving(false)
        rafId = requestAnimationFrame(tick)
      },
    })
  } else {
    rafId = requestAnimationFrame(tick)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup',   onKeyUp)
  cancelAnimationFrame(rafId)
  moveTween?.kill()
})
</script>

<template>
  <div class="gallery-wrapper">

    <!-- Stage -->
    <div
      ref="stageRef"
      class="stage"
      :style="{ width: `${stageW}px`, height: `${stageH}px` }"
      @click="onStageClick"
      @touchstart.prevent="onStageTouchStart"
      @touchmove.prevent="onStageTouchMove"
      @touchend.prevent="onStageTouchEnd"
    >

      <!-- ── Map tiles ── -->
      <template v-for="(row, ri) in mapGrid" :key="ri">
        <div
          v-for="(cell, ci) in row"
          :key="`${ri}-${ci}`"
          class="tile"
          :class="tileCssClass(cell)"
          :style="{
            left:   `${ci * TILE_SIZE}px`,
            top:    `${ri * TILE_SIZE}px`,
            width:  `${TILE_SIZE}px`,
            height: `${TILE_SIZE}px`,
            zIndex: ri,
            display: cellBase(cell) === -1 ? 'none' : 'block',
            backgroundImage: (floorVariants[ri]?.[ci] ?? 0) > 0
              ? `url('/map-floor-${floorVariants[ri]?.[ci]}.webp')`
              : undefined,
          }"
        />
      </template>

      <!-- ── Floor items ── -->
      <div
        v-for="item in floorItems"
        :key="item.id"
        class="floor-item"
        :style="{
          left:   `${item.col * TILE_SIZE}px`,
          top:    `${item.row * TILE_SIZE}px`,
          width:  `${TILE_SIZE}px`,
          height: `${TILE_SIZE}px`,
          zIndex: item.row * TILE_SIZE + TILE_SIZE / 2,
        }"
      >
        <img :src="item.src" :alt="item.id" draggable="false" />
      </div>

      <!-- ── Paintings ── -->
      <div
        v-for="(painting, idx) in paintings"
        :key="painting.id"
        class="painting"
        :ref="(el) => { paintingEls[idx] = el as HTMLElement }"
        :style="{
          /* 65% of tile width, centred horizontally on the tile */
          width:  `${TILE_SIZE * 0.55}px`,
          left:   `${painting.col * TILE_SIZE + TILE_SIZE * 0.25}px`,
          /* Vertically centred with a small top margin */
          top:    `${painting.row * TILE_SIZE + TILE_SIZE * 0.25}px`,
          zIndex: painting.row * TILE_SIZE + 60,
        }"
        @mouseenter="onPaintingEnter(idx)"
        @mouseleave="onPaintingLeave(idx)"
        @click.stop="onPaintingClick(painting, $event)"
        @touchend.stop.prevent="onPaintingClick(painting, $event)"
      >
        <img :src="painting.src" :alt="painting.title" draggable="false" />
      </div>

      <!-- ── Wall texts ── -->
      <div
        v-for="wt in wallTexts"
        :key="wt.id"
        class="wall-text"
        :class="`wall-text--${wt.align}`"
        :style="{
          width:   `${TILE_SIZE}px`,
          left:    `${wt.col * TILE_SIZE}px`,
          top:     `${wt.row * TILE_SIZE}px`,
          height:  `${TILE_SIZE}px`,
          zIndex:  wt.row * TILE_SIZE + 60,
        }"
      >{{ wt.text }}</div>

      <!-- ── Wall actions ── -->
      <div
        v-for="wa in wallActions"
        :key="wa.id"
        class="wall-action"
        :class="`wall-action--${wa.type}`"
        :style="{
          left:   `${wa.col * TILE_SIZE}px`,
          top:    `${wa.row * TILE_SIZE}px`,
          width:  `${TILE_SIZE}px`,
          height: `${TILE_SIZE}px`,
          zIndex: wa.row * TILE_SIZE + 60,
        }"
        @click.stop="onWallActionClick(wa.type)"
        @touchend.stop.prevent="onWallActionClick(wa.type)"
      >
        <template v-if="wa.type === 'about'">
          <span class="wall-action__label">About</span>
        </template>
        <template v-else-if="wa.type === 'links'">
          <span class="wall-action__btn">Take Free</span>
        </template>
        <template v-else-if="wa.type === 'exit'">
          <span class="wall-action__label">Exit</span>
        </template>
      </div>

      <!-- ── Visitors ── -->
      <div
        v-for="(style, vi) in visitorStyles"
        :key="`visitor-${vi}`"
        class="visitor"
        :ref="el => { visitorEls[vi] = el as HTMLElement }"
        :style="{ width: `${VISITOR_W}px`, height: `${VISITOR_H}px` }"
      >
        <img :src="`/visitor-${style}.webp`" alt="Visitor" draggable="false" />
      </div>

      <!-- ── Character ── -->
      <div
        ref="charEl"
        class="character"
        :style="{ width: `${CHAR_W}px`, height: `${CHAR_H}px` }"
      >
        <img :src="isMoving ? `/${props.character.walking}` : `/${props.character.static}`" alt="Character" draggable="false" />
      </div>

    </div>

    <!-- ── Painting modal ── -->
    <PaintingModal
      v-if="activePainting"
      :painting="activePainting"
      @close="activePainting = null"
    />

    <!-- ── About modal ── -->
    <Transition name="modal">
      <div v-if="showAboutModal" class="about-overlay" @click.self="showAboutModal = false">
        <div class="about-content">
          <svg class="about-house-bg" viewBox="0 0 100 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M 50 2 L 99 28 L 99 118 L 1 118 L 1 28 Z" fill="#F6F6F6" stroke="#333" stroke-width="0.6" stroke-linejoin="miter" vector-effect="non-scaling-stroke" />
          </svg>
          <div class="about-inner">
            <p class="about-text">Hi, I’m Ann, a front-end developer and designer. <br> This project was built with Vue and GSAP, with most of the code logic assisted by Claude.ai. <br> Visit my GitHub for details.</p>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
/* ── Layout ────────────────────────────────────────────── */
.gallery-wrapper {
  position: fixed;
  inset: 0;
  background: #111;
  overflow: hidden;
}

/* ── Stage ─────────────────────────────────────────────── */
/* left/top driven by applyCamera() so the character stays centred */
.stage {
  position: absolute;
  cursor: crosshair;
  user-select: none;
}

/* ── Tiles ─────────────────────────────────────────────── */
.tile {
  position: absolute;
  background-repeat: repeat;
  background-size: cover;
}
.tile.map-floor-1    { background-image: url('/map-floor-1.webp'); }
.tile.map-wall-left  { background-image: url('/map-wall-left.webp'); }
.tile.map-wall-center{ background-image: url('/map-wall-center.webp'); }
.tile.map-wall-right { background-image: url('/map-wall-right.webp'); }

/* ── Floor item ────────────────────────────────────────── */
.floor-item {
  position: absolute;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.floor-item img {
  width: 200%;
  height: auto;
  display: block;
  object-fit: contain;
}

/* ── Painting ──────────────────────────────────────────── */
.painting {
  position: absolute;
  cursor: pointer;
  transform-origin: center center;
  /* Pre-set initial filter so GSAP can interpolate from it */
  filter: brightness(1) drop-shadow(0 0 0px rgba(0, 0, 0, 0));
}
.painting img {
  width: 100%;
  height: auto;
  display: block;
  pointer-events: none;
}

/* ── Character ─────────────────────────────────────────── */
.character {
  position: absolute;
  pointer-events: none;
  transform-origin: center center;
  /* GSAP / the RAF loop sets left/top/zIndex/transform directly */
}
.character img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* ── Wall actions ──────────────────────────────────────── */
.wall-action {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  padding-top: 20px;
}
.wall-action__label {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #000;
}

.wall-action__btn {
  background: #000;
  color: #fff;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 10px 14px;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: transform 0.2s ease;
}
.wall-action__btn:hover {
  transform: scale(1.12);
}

/* ── About modal ───────────────────────────────────────── */
.about-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: pointer;
  backdrop-filter: blur(3px);
}
.about-content {
  position: relative;
  width: min(400px, 88vw);
  cursor: default;
}
.about-house-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
  filter: drop-shadow(0 12px 40px rgba(0, 0, 0, 0.55));
}
.about-inner {
  position: relative;
  z-index: 1;
  padding: 80px 56px 48px 56px;
}
.about-text {
  font-size: 16px;
  line-height: 1.7;
  color: #000;
}
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from,  .modal-leave-to      { opacity: 0; }

/* ── Wall text ─────────────────────────────────────────── */
.wall-text {
  position: absolute;
  pointer-events: none;
  display: flex;
  align-items: center;
  padding-top: 20px;
  color: #000;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-line;
  overflow: hidden;
}
.wall-text--center {
  justify-content: center;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.wall-text--left {
  justify-content: flex-start;
  text-align: left;
}

/* ── Visitor ───────────────────────────────────────────── */
.visitor {
  position: absolute;
  pointer-events: none;
  transform-origin: center center;
}
.visitor img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

</style>
