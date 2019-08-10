import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import autoExternal from 'rollup-plugin-auto-external';
import globals from 'rollup-plugin-node-globals';
import builtins from 'rollup-plugin-node-builtins';


import pkg from './package.json';

export default [
	// browser-friendly UMD build
	{
		input: 'src/snap.js',
		output: {
			name: 'Snap',
			file: pkg.browser,
			format: 'umd'
		},
		external:['ws'],
		plugins: [
			commonjs(),
			resolve({preferBuiltins: true}), 
			builtins(),
			globals(),
		],
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