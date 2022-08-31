<template>
	<div class="middle">
		<router-view v-slot="{ Component, route }">
			<Transition name="page">
				<component :is="Component" :key="route.path"/>
			</Transition>
		</router-view>
	</div>
</template> 

<script>
</script>

<style scoped>
</style>
