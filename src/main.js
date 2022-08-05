import { createRouter, createWebHashHistory } from 'vue-router' 
import { createApp } from 'vue'
import App from './App.vue'

import Articles from './pages/Articles.vue'
import ArticlePage from './pages/ArticlePage.vue'

const routes = [
	{ path: '/', component: Articles },
	{ path: '/articles', component: Articles },
	{ path: '/article/:uuid', component: ArticlePage },
]

const router = createRouter({
	history: createWebHashHistory(),
	routes,
})

const app = createApp(App)
app.use(router)
app.mount('#app')
