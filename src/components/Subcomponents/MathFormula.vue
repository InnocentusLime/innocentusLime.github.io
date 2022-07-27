<script>
import { h } from 'vue'
import katex from 'katex'

export default {
	name: "MathFormula",
	props: ["formula", "display"],
  computed: {
		mathHTML() {
			return katex.renderToString(this.formula, { throwOnError: false })
		},
	},
	render() {
		return h(this.display, {
				innerHTML: this.mathHTML
		})
	},
}
</script>

<style scoped>
</style>
