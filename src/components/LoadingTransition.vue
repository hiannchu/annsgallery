<script setup lang="ts">
import { ref, onMounted } from 'vue'
import gsap from 'gsap'

const emit = defineEmits<{ done: [] }>()

const houseEls = ref<(SVGSVGElement | null)[]>([])

onMounted(() => {
  gsap.set(houseEls.value, { opacity: 0, x: -24 })
  gsap.to(houseEls.value, {
    opacity: 1,
    x: 0,
    duration: 0.6,
    stagger: 0.25,
    ease: 'power3.out',
    onComplete: () => {
      gsap.to(houseEls.value, {
        opacity: 0,
        y: -10,
        duration: 0.45,
        stagger: 0.12,
        ease: 'power2.in',
        delay: 1.0,
        onComplete: () => emit('done'),
      })
    },
  })
})
</script>

<template>
  <div class="loading-screen">
    <div class="house-row">
      <svg
        v-for="i in 3"
        :key="i"
        :ref="el => { houseEls[i - 1] = el as SVGSVGElement }"
        class="house"
        viewBox="0 0 169 132"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M169 132H0V42.8857L84.5 0L169 42.8857V132Z" fill="black" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.loading-screen {
  position: fixed;
  inset: 0;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}
.house-row {
  display: flex;
  align-items: flex-end;
  gap: 28px;
}
.house {
  width: 80px;
  height: 250px;
}
</style>
