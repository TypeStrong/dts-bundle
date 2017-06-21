module.exports = function (grunt) {
	'use strict';

	grunt.loadNpmTasks('grunt-ts');
	grunt.loadNpmTasks('grunt-mocha-test');
	grunt.loadNpmTasks('grunt-contrib-clean');

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clean: {
			cruft: {
				option: {
					dot: true
				},
				src: [
					'tscommand-*.tmp.txt',
					'test/**/.baseDir*'
				]
			},
			tmp: [
				'tmp/**/*',
				'test/tmp/**/*'
			],
			test: [
				'test/build/**/*'
			]
		},
		ts: {
			options: {
				fast: 'never',
				target: 'es5',
				module: 'commonjs',
				declaration: true,
				removeComments: false,
				sourceMap: false
			},
			main: {
				src: [
					'./lib/index.ts',
				],
				options: {
					"target": "es5",
					"module": "commonjs",
					"isolatedModules": false,
					"experimentalDecorators": true,
					"emitDecoratorMetadata": true,
					"declaration": false,
					"noImplicitAny": true,
					"removeComments": true,
					"noLib": false,
					"preserveConstEnums": false,
					"suppressImplicitAnyIndexErrors": false
				}
			},
			test: {
				src: ['test/src/main/index.ts'],
				outDir: 'test/build/sub/'
			},
			testEs6: {
				src: ['test/src/es6/index.ts'],
				outDir: 'test/build/es6/'
			},
			testCommonJs: {
				src: ['test/src/commonjs/index.ts'],
				outDir: 'test/build/commonjs'
			},
			testConflicts: {
				src: ['test/src/conflicts/dirname/index.ts'],
				outDir: 'test/build/conflicts/dirname'
			}
		},
		mochaTest: {
			options: {
				timeout: 5000,
				reporter: 'mocha-unfunk-reporter'
			},
			all: {
				src: 'test/test.js'
			}
		}
	});

	grunt.registerTask('prep', [
		'clean:tmp',
		'clean:test',
		'clean:cruft'
	]);

	grunt.registerTask('test', [
		'prep',
		'ts:test',
		'ts:testEs6',
		'ts:testCommonJs',
		'ts:testConflicts',
		'run'
	]);

	grunt.registerTask('run', [
		'clean:tmp',
		'ts:main',
		'mochaTest:all',
		'sweep'
	]);

	grunt.registerTask('prepublish', [
		'build',
		'ts:test',
		'mochaTest:all',
		'sweep'
	]);

	grunt.registerTask('sweep', [
		'clean:cruft'
	]);

	grunt.registerTask('default', ['test']);
};
