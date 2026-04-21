<script setup lang="ts">
import { ref, onMounted } from 'vue'
import gsap from 'gsap'

defineProps<{
  painting: { id: string; src: string; title: string }
}>()

const emit = defineEmits<{ close: [] }>()

const overlayRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)

// ── Entrance animation ─────────────────────────────────────────────────────────
onMounted(() => {
  gsap.fromTo(overlayRef.value,
    { opacity: 0 },
    { opacity: 1, duration: 0.25, ease: 'none' }
  )
  gsap.fromTo(contentRef.value,
    { scale: 0.88, y: 24, opacity: 0 },
    { scale: 1, y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.5)', delay: 0.05 }
  )
})

// ── Exit animation then emit ───────────────────────────────────────────────────
function close() {
  gsap.to(contentRef.value, { scale: 0.88, y: 12, opacity: 0, duration: 0.2, ease: 'power2.in' })
  gsap.to(overlayRef.value, {
    opacity: 0,
    duration: 0.25,
    delay: 0.08,
    ease: 'none',
    onComplete: () => emit('close'),
  })
}

function onOverlayClick(e: Event) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <div
    ref="overlayRef"
    class="overlay"
    @click="onOverlayClick"
    @touchend.prevent="onOverlayClick"
  >
    <div ref="contentRef" class="content">

      <!--
        House-shaped SVG background.
        ViewBox: 0 0 100 120 — roof occupies y 0–28 (23 %), walls y 28–118.
        preserveAspectRatio="none" lets it stretch to fit any content height.
        vector-effect="non-scaling-stroke" keeps stroke width visually constant.
      -->
      <svg
        class="house-bg"
        viewBox="0 0 100 120"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M 50 2 L 99 28 L 99 118 L 1 118 L 1 28 Z"
          fill="#F6F6F6"
          stroke="#333"
          stroke-width="0.6"
          stroke-linejoin="miter"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <!-- Content sits inside the walls (padding-top clears the roof triangle) -->
      <div class="inner">
        <div class="image-frame">
          <img :src="painting.src" :alt="painting.title" class="artwork" draggable="false" />
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ── Overlay ───────────────────────────────────────────── */
.overlay {
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

/* ── House card ────────────────────────────────────────── */
/*
  No background/border/border-radius here — the SVG draws all of that.
  Width sets the footprint; height is driven by .inner content.
*/
.content {
  position: relative;
  width: min(560px, 88vw);
  cursor: default;
}

/* ── SVG background ────────────────────────────────────── */
.house-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  /* Allow the jagged edges to bleed very slightly outside the box */
  overflow: visible;
  /* Soft shadow that follows the house silhouette */
  filter: drop-shadow(0 12px 40px rgba(0, 0, 0, 0.55));
}

/* ── Inner content (sits above the SVG) ───────────────── */
.inner {
  position: relative;
  z-index: 1;
  /* padding-top clears the roof triangle (~25 % of height + small buffer) */
  padding: 28% 1.6rem 1.8rem;
}


/* ── Image ─────────────────────────────────────────────── */
.image-frame {
  overflow: hidden;
}
.artwork {
  width: 100%;
  height: auto;
  display: block;
  max-height: 55vh;
  object-fit: contain;
}
</style>
