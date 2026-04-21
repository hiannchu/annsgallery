<script setup lang="ts">
import { ref, onMounted } from 'vue'
import gsap from 'gsap'

const CHARACTERS = [
  { id: 'cat',   static: 'character-cat.webp',   walking: 'character-cat.GIF'   },
  { id: 'dog',   static: 'character-dog.webp',   walking: 'character-dog.GIF'   },
  { id: 'alien', static: 'character-alien.webp', walking: 'character-alien.GIF' },
  { id: 'rock',  static: 'character-rock.webp',  walking: 'character-rock.GIF'  },
]

type Character = typeof CHARACTERS[number]

const emit = defineEmits<{ confirm: [character: Character] }>()

const selectedId = ref<string | null>(null)
const animating  = ref(false)

const cardEls    = ref<(HTMLElement | null)[]>([])
const titleEl    = ref<HTMLElement | null>(null)
const btnEl      = ref<HTMLElement | null>(null)
const doorEl     = ref<HTMLElement | null>(null)
const doorTextEl = ref<HTMLElement | null>(null)

onMounted(() => {
  // Title + button fade in
  gsap.from([titleEl.value, btnEl.value], {
    opacity: 0,
    y: 16,
    duration: 0.6,
    stagger: 0.12,
    ease: 'power3.out',
  })

  // Staggered card entrance
  gsap.from(cardEls.value, {
    opacity: 0,
    y: 40,
    duration: 0.7,
    stagger: 0.1,
    ease: 'power3.out',
  })

  // Prime the door: set rotation origin to right edge, flat (no perspective)
  gsap.set(doorEl.value, {
    transformOrigin: 'right bottom',
    transformPerspective: 0,
    rotateY: 0,
  })
})

// ── Character card selection ─────────────────────────────
function select(idx: number) {
  if (animating.value) return
  const char = CHARACTERS[idx]
  if (!char) return

  if (selectedId.value) {
    const prevIdx = CHARACTERS.findIndex(c => c.id === selectedId.value)
    if (prevIdx !== -1 && prevIdx !== idx && cardEls.value[prevIdx]) {
      gsap.to(cardEls.value[prevIdx], {
        scale: 1,
        filter: 'drop-shadow(0 0 0px rgba(0,0,0))',
        duration: 0.25,
        ease: 'power2.out',
      })
    }
  }

  selectedId.value = char.id

  if (!cardEls.value[idx]) return
  gsap.to(cardEls.value[idx], {
    scale: 1.08,
    filter: 'drop-shadow(0 0 24px rgba(255, 215, 80, 0.9))',
    duration: 0.3,
    ease: 'power2.out',
  })
}

// ── Door hover — swing fully open / close ───────────────
function onBtnEnter() {
  if (!selectedId.value || animating.value) return
  gsap.to(doorTextEl.value, { opacity: 0, duration: 0.15, ease: 'none' })
  gsap.to(doorEl.value, {
    rotateY: -180,
    duration: 0.6,
    ease: 'power2.out',
  })
}

function onBtnLeave() {
  if (animating.value) return
  gsap.to(doorEl.value, {
    rotateY: 0,
    duration: 0.4,
    ease: 'power2.out',
    onComplete: () => gsap.set(doorTextEl.value, { opacity: 1 }),
  })
}

// ── Confirm / cinematic entrance ─────────────────────────
function confirm() {
  if (!selectedId.value || animating.value) return
  const idx    = CHARACTERS.findIndex(c => c.id === selectedId.value)
  const char   = CHARACTERS[idx]
  if (!char) return
  const charEl = cardEls.value[idx]
  if (!charEl || !btnEl.value) return

  animating.value = true

  // Measure where character needs to travel (button centre in character-relative coords)
  const bRect = btnEl.value.getBoundingClientRect()
  const cRect = charEl.getBoundingClientRect()
  const tx = bRect.left + bRect.width  / 2 - (cRect.left + cRect.width  / 2)
  const ty = bRect.top  + bRect.height / 2 - (cRect.top  + cRect.height / 2)

  // Step 1 — door swings fully open
  gsap.to(doorEl.value, {
    rotateY: -180,
    duration: 0.55,
    ease: 'power2.inOut',
  })

  // Fade out every other card and the title
  const others = cardEls.value.filter((_, i) => i !== idx)
  gsap.to([...others, titleEl.value], {
    opacity: 0,
    duration: 0.35,
    ease: 'power2.in',
  })

  // Lift character above the button layer so it passes in front of the opening
  gsap.set(charEl, { zIndex: 10 })

  // Character walks to the portal button, then emits confirm
  // (walking GIF already active via reactive selectedId)
  gsap.to(charEl, {
    x: tx,
    y: ty,
    opacity: 1,
    duration: 2,
    ease: 'power2.inOut',
    delay: 0,
    onComplete: () => emit('confirm', char),
  })
}
</script>

<template>
  <div class="select-screen">

    <p ref="titleEl" class="title">Choose your character</p>

    <div class="char-row">

      <div class="char-grid">
        <div
          v-for="(char, idx) in CHARACTERS"
          :key="char.id"
          :ref="el => { cardEls[idx] = el as HTMLElement }"
          class="char-card"
          @click="select(idx)"
        >
          <img
            :src="`/${selectedId === char.id ? char.walking : char.static}`"
            :alt="char.id"
            draggable="false"
          />
        </div>
      </div>

      <!--
        Three-layer house-portal button:
          1. btn-interior  — black fill; the "inside" revealed when door swings open
          2. btn-label     — white text; readable against the dark interior
          3. btn-door      — same-background fill + stroke; hinges on the RIGHT edge
      -->
      <button
        ref="btnEl"
        class="confirm-btn"
        :class="{ 'is-ready': selectedId }"
        :disabled="!selectedId || animating"
        @click="confirm"
        @mouseenter="onBtnEnter"
        @mouseleave="onBtnLeave"
      >
        <!-- Interior (always behind the door) -->
        <svg
          class="btn-interior"
          viewBox="0 0 160 50"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M 80 1 L 159 13 L 159 49 L 1 49 L 1 13 Z" fill="#000" />
        </svg>

        <!-- Label (white — visible once door opens) -->
        <span class="btn-label">Enter</span>

        <!-- Door (front face — pivots on right edge) -->
        <div ref="doorEl" class="btn-door">
          <svg
            class="btn-door-svg"
            viewBox="0 0 160 50"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M 80 1 L 159 13 L 159 49 L 1 49 L 1 13 Z"
              fill="#F6F6F6"
              stroke="#ccc"
              stroke-width="1"
              stroke-linejoin="miter"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <span ref="doorTextEl" class="door-label">Gallery</span>
        </div>
      </button>

    </div><!-- /.char-row -->

  </div><!-- /.select-screen -->
</template>

<style scoped>
/* ── Screen ─────────────────────────────────────────────── */
.select-screen {
  position: fixed;
  inset: 0;
  background: #F6F6F6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8vh;
}

/* ── Title ──────────────────────────────────────────────── */
.title {
  color: rgb(0, 0, 0);
  font-size: 16px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

/* ── Character row (grid + button side by side) ─────────── */
.char-row {
  display: flex;
  box-sizing: border-box;
  width: 100%;
  justify-content: left;
  gap: 8vw;
  padding: 0 8vw;
}
@media (max-width: 1280px) {
  .char-row { flex-direction: column; align-items: center; gap: 32px; }
}

/* ── Grid ───────────────────────────────────────────────── */
.char-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
@media (max-width: 1024px) {
  .char-grid { grid-template-columns: repeat(2, 1fr); gap: 28px;}
}

/* ── Card ───────────────────────────────────────────────── */
.char-card {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  cursor: pointer;
  transform-origin: center bottom;
}
.char-card img {
  height: 180px;
  width: auto;
  display: block;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}
@media (max-width: 1024px) {
  .char-card img { height: 130px; }
}

/* ── Confirm button ─────────────────────────────────────── */
.confirm-btn {
  position: relative;
  background: transparent;
  border: none;
  color: #fff;            /* label colour — white against the dark interior */
  font-size: 16px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  padding:56px 56px;
  cursor: pointer;
  overflow: visible;      /* let the rotating door poke out during animation */
}

/* Interior SVG — the dark "inside" of the house */
.btn-interior {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 1;
}

/* Label — sits above the interior, below the door */
.btn-label {
  position: relative;
  z-index: 2;
}

/* Door wrapper — the front face that GSAP rotates around the right edge */
.btn-door {
  position: absolute;
  inset: 0;
  z-index: 3;
  overflow: visible;
}

/* SVG fills the wrapper, stretches to match button shape */
.btn-door-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

/* Label sits centred over the door in normal HTML flow — no SVG distortion */
.door-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #ccc;
  transition: color 0.3s ease;
  pointer-events: none;
  padding-top: 6px; /* nudge down into the rectangular body, clear of the roof */
}
.confirm-btn.is-ready .door-label {
  color: #000;
}

.confirm-btn .btn-door-svg path {
  transition: stroke 0.3s ease;
}
.confirm-btn.is-ready .btn-door-svg path {
  stroke: #000;
}

.confirm-btn:disabled {
  cursor: default;
}
</style>
