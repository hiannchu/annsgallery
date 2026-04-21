import { createApp } from 'vue'
import App from './App.vue'

window.addEventListener('contextmenu', e => e.preventDefault())

createApp(App).mount('#app')
