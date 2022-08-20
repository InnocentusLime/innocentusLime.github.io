<template>
	<main><div class="art-list">
		<Transition>
			<p class="loading-articles" v-if="articleInfos.length === 0">Loading articles...</p>
		</Transition>
		<TransitionGroup>
			<ArticlePanel v-for="info in articleInfos" :articleInfo="info" :key="info.uuid"/>
		</TransitionGroup>
	</div></main>
</template> 

<script>
//import MathFormula from "./Subcomponents/MathFormula"
import axios from "axios"
import ArticlePanel from "./parts/ArticlePanel"

export default {
	name: "Articles",
	components: {
		ArticlePanel,
	},
	data() {
		return {
			articleInfos: [],
		}
	},
	computed: {},
	beforeMount() {
    axios.get("/articlePanels/page1.json").then(response => {
			if (response.status === 200) {
				this.articleInfos = response.data
			}
    });
  },
}
</script>

<style scoped>
</style>
