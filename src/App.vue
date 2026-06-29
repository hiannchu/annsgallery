<script setup lang="ts">
import { ref } from 'vue'
import CharacterSelect    from './components/CharacterSelect.vue'
import GalleryScene       from './components/GalleryScene.vue'
import LoadingTransition  from './components/LoadingTransition.vue'
import ThankYou           from './components/ThankYou.vue'

type Character = { id: string; static: string; walking: string }

const view      = ref<'select' | 'loading' | 'gallery' | 'thanks'>('select')
const character = ref<Character | null>(null)

let galleryReady    = false
let transitionDone  = false

function tryEnterGallery() {
  if (galleryReady && transitionDone) view.value = 'gallery'
}

function onConfirm(char: Character) {
  character.value = char
  galleryReady   = false
  transitionDone = false
  view.value     = 'loading'
}

function onGalleryReady() {
  galleryReady = true
  tryEnterGallery()
}

function onTransitionDone() {
  transitionDone = true
  tryEnterGallery()
}

function onExit() {
  view.value = 'thanks'
}

function onBack() {
  view.value = 'select'
}
</script>

<template>
  <CharacterSelect v-if="view === 'select'" @confirm="onConfirm" />

  <LoadingTransition v-if="view === 'loading'" @done="onTransitionDone" />

  <!-- Mounted during loading to preload map + assets, hidden until gallery is shown -->
  <GalleryScene
    v-if="(view === 'loading' || view === 'gallery') && character"
    v-show="view === 'gallery'"
    :character="character"
    @ready="onGalleryReady"
    @exit="onExit"
  />

  <ThankYou v-if="view === 'thanks' && character" :character="character" @back="onBack" />
</template>

<style>
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  user-select: none;
  -webkit-user-select: none;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0d0d0d;
  font-family: 'Elms Sans';
}
</style>
