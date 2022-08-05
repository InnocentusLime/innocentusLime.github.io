<template>
	Article {{ $route.params.uuid }}!
</template> 

<script>
//import MathFormula from "./Subcomponents/MathFormula"
//import axios from "axios"
//import ArticlePanel from "./parts/ArticlePanel"

export default {
	name: "Middle",
	components: {},
  computed: {},
  beforeMount() {
		/*
    axios.get("/articlePanels/page1.json").then(response => {
      this.articleInfos = response.data;
    });
		*/
  },
}
</script>

<style scoped>
</style>
