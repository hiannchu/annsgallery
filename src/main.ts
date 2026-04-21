import { createApp } from 'vue'
import App from './App.vue'
import { inject } from '@vercel/analytics'

window.addEventListener('contextmenu', e => e.preventDefault())

inject()
createApp(App).mount('#app')
