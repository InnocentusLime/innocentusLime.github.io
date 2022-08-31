import { createRouter, createWebHashHistory } from 'vue-router' 
import { createApp } from 'vue'
import App from './App.vue'

import Articles from './pages/Articles.vue'
import ArticlePage from './pages/ArticlePage.vue'
import UnderConstruction from './pages/UnderConstruction.vue'

const routes = [
	{ path: '/', component: Articles },
	{ path: '/articles', component: Articles },
	{ path: '/article/:uuid', component: ArticlePage },
	{ path: '/projects', component: UnderConstruction },
	{ path: '/resources', component: UnderConstruction },
	{ path: '/search', component: UnderConstruction },
]

const router = createRouter({
	history: createWebHashHistory(),
	routes,
})

const app = createApp(App)
app.use(router)
app.mount('#app')
