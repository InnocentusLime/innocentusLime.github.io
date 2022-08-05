<template>
	<li><a href="#" :class="cssClass">{{tagInfo.title}}</a></li>
</template>

<script>
export default {
	name: "Tag",
	props: ["tagInfo"],
	computed: {
		cssClass() { 
			return [this.tagInfo.tagClass, "button"].join(" ")
		}
	},
}
</script>

<style scoped>
</style>
