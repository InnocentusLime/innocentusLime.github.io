<script>
import { h } from 'vue'
//import { MarkdownIt } from 'markdown-it'

export default {
	name: "MdBlock",
	props: ["text"],
  computed: {
		mdHTML() {
			let MarkdownIt = require('markdown-it')
			let mb = new MarkdownIt();
			return mb.render(this.text);
		},
	},
	render() {
		return h("div", {
				class: "md",
				innerHTML: this.mdHTML
		})
	},
}
</script>

<style scoped>
</style>
