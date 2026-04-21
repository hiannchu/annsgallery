<script setup lang="ts">
import { ref } from 'vue'
import CharacterSelect from './components/CharacterSelect.vue'
import GalleryScene    from './components/GalleryScene.vue'
import ThankYou        from './components/ThankYou.vue'

type Character = { id: string; static: string; walking: string }

const view      = ref<'select' | 'gallery' | 'thanks'>('select')
const character = ref<Character | null>(null)

function onConfirm(char: Character) {
  character.value = char
  view.value      = 'gallery'
}

function onExit() {
  view.value = 'thanks'
}

function onBack() {
  view.value = 'select'
}
</script>

<template>
  <CharacterSelect v-if="view === 'select'"                      @confirm="onConfirm" />
  <GalleryScene    v-else-if="view === 'gallery' && character"   :character="character" @exit="onExit" />
  <ThankYou        v-else-if="view === 'thanks'  && character"   :character="character" @back="onBack" />
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
