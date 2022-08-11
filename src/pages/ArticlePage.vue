<template>
	<article class='theArticle'>
		<p v-if="articleMd === null">Loading article md...</p>
		<MdBlock v-if="articleMd !== null" :text='articleMd'/>
	</article>
</template> 

<script>
import MdBlock from "./parts/MdBlock"
//Article {{ $route.params.uuid }}!
//import MathFormula from "./Subcomponents/MathFormula"
import axios from "axios"
//import ArticlePanel from "./parts/ArticlePanel"

export default {
	name: "ArticlePage",
	components: { 
		MdBlock 
	},
  data() {
    return {
      articleMd: null,
    }
  },
  computed: {},
  beforeMount() {
    axios.get("/articles/" + this.$route.params.uuid + ".md").then(response => {
			if (response.status == 200) {
				this.articleMd = response.data;
			}
    });
  },
}
</script>

<style scoped>
</style>
