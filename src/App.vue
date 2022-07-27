<template>
	<div id="app">
		<Header/>
		<Middle/>
		<Footer/>
	</div>	
</template>

<script>
import Header from "./components/Header";
import Middle from "./components/Middle";
import Footer from "./components/Footer";

export default {
  name: 'App',
  components: {
		Header,
		Middle,
		Footer,
  }
}
</script>

<style>
#app {

}
</style>
