import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import autoExternal from 'rollup-plugin-auto-external';
import { uglify } from 'rollup-plugin-uglify';
import pkg from './package.json';

export default [
	// browser-friendly UMD build
	{
		input: 'src/snap.js',
		output: {
			name: 'snapgraph',
			file: pkg.browser,
			format: 'umd'
		},
		plugins: [
			resolve(), 
            commonjs(),
            uglify() 
		]
	},

	// CommonJS (for Node) and ES module (for bundlers) build.
	{
        input: 'src/snap.js',
        plugins:[autoExternal()],
		output: [
			{ file: pkg.main, format: 'cjs' },
			{ file: pkg.module, format: 'es' }
		]
	}
];