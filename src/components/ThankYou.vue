<script setup lang="ts">
import { ref, onMounted } from 'vue'
import gsap from 'gsap'

const props = defineProps<{
  character: { id: string; static: string; walking: string }
}>()

const emit = defineEmits<{ back: [] }>()

const charEl  = ref<HTMLElement | null>(null)
const textEl  = ref<HTMLElement | null>(null)
const btnEl   = ref<HTMLElement | null>(null)

onMounted(() => {
  const tl = gsap.timeline()

  // Text + button fade in
  tl.from([textEl.value, btnEl.value], {
    y: 16,
    duration: 0.6,
    stagger: 0.15,
    ease: 'power3.out',
  })

  // Character walks in from the left (starts off-screen)
  gsap.set(charEl.value, { x: -200, opacity: 0 })
  tl.to(charEl.value, {
    x: 0,
    opacity: 1,
    duration: 1.1,
    ease: 'power2.out',
  }, '-=0.3')
})

function onBack() {
  const tl = gsap.timeline({ onComplete: () => emit('back') })
  tl.to([textEl.value, btnEl.value, charEl.value], {
    opacity: 0,
    y: -12,
    duration: 0.35,
    stagger: 0.06,
    ease: 'power2.in',
  })
}
</script>

<template>
  <div class="thank-screen">

    <p ref="textEl" class="thank-text">Thank you for visiting</p>

    <div ref="charEl" class="char-wrap">
      <img
        :src="`/${character.walking}`"
        :alt="character.id"
        draggable="false"
        class="char-img"
      />
    </div>

    <button ref="btnEl" class="back-btn" @click="onBack">
      Go back to entrance
    </button>

  </div>
</template>

<style scoped>
.thank-screen {
  position: fixed;
  inset: 0;
  background: #F6F6F6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6vh;
}

.thank-text {
  font-size: 16px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #000;
}

.char-wrap {
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.char-img {
  height: 180px;
  width: auto;
  display: block;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.back-btn {
  background: transparent;
  border: none;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #000;
  cursor: pointer;
  padding: 10px 0;
  border-bottom: 1px solid #000;
  transition: opacity 0.2s;
}

.back-btn:hover {
  opacity: 0.5;
}
</style>
