<template>
	<main><div class="art-list">
		<ArticlePanel v-for="info in articleInfos" :articleInfo="info" :key="info.uuid"/>
	</div></main>
</template> 

<script>
//import MathFormula from "./Subcomponents/MathFormula"
import axios from "axios"
import ArticlePanel from "./parts/ArticlePanel"

export default {
	name: "Middle",
	components: {
		ArticlePanel,
	},
  data() {
    return {
      articleInfos: [{title:"Loading...", date:"", summary:"Loading...", tags:[]}],
    }
  },
  computed: {},
  beforeMount() {
    axios.get("/articlePanels/page1.json").then(response => {
      this.articleInfos = response.data;
    });
  },
}
</script>

<style scoped>
</style>
