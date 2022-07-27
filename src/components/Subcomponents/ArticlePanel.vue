<template>
	<article class="art-container">
		<div class="info button">
			<a href="#" class="title button">{{articleInfo.title}}</a>
			<a class="date">{{articleInfo.date}}</a>
		</div>
		<div class="summary">{{articleInfo.summary}}</div>
		<ul class="tag-container">
			<Tag v-for="tag in articleInfo.tags" :tagInfo="tag" :key="tag.title"/>
		</ul>
	</article>
</template>

<script>
import Tag from "./Tag"

export default {
	name: "ArticlePanel",
	props: ["articleInfo"],
	components: {
		Tag,
	},
}
</script>

<style scoped>
</style>
