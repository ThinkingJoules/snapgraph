import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import autoExternal from 'rollup-plugin-auto-external';
import globals from 'rollup-plugin-node-globals';
import builtins from 'rollup-plugin-node-builtins';
import hypothetical from 'rollup-plugin-hypothetical';


import pkg from './package.json';

export default [
	// browser-friendly UMD build
	{
		input: 'src/snap.js',
		output: {
			name: 'Snap',
			file: pkg.browser,
			format: 'umd',
			sourceMap: 'inline',
			globals : {
				ws: 'WebSockets',
				crypto: 'crypto',
				atob:'atob',
				btoa:'btoa'
			}
		},
		external:['ws','text-encoding', 'crypto','atob','btoa'],
		plugins: [
			hypothetical({
				allowRealFiles: true,
				files: {
				'./src/peer/listen.js': `
					export default {}
				`,
				'./src/peer/disk.js': `
					export default {}
				`,
				'node-webcrypto-ossl/': `
					export default {}
				`,
				},
				allowFallthrough:true
			}),
			commonjs(),
			builtins({crypto:false}),
			resolve({preferBuiltins: true}), 
			globals(),
		],
		
	},
	
	// CommonJS (for Node) and ES module (for bundlers) build.
	{
        input: 'src/snap.js',
		plugins:[autoExternal(),
			hypothetical({
			allowRealFiles: true,
			files: {
			'btoa/': `
				export default function btoa(str){return Buffer.from(str,'latin1').toString('base64');};
			`,
			'atob/': `
				export default function atob(str){return Buffer.from(str,'base64').toString('latin1');};
			`,
			},
			allowFallthrough:true
		})],
		external:['crypto'],
		output: [
			{ 
				file: pkg.main, 
				format: 'cjs'
			},
			{ 
				file: pkg.module, 
				format: 'es'
		 	}
		]
	}
];