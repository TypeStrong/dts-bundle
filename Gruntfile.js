module.exports = function (grunt) {
	'use strict';

	grunt.loadNpmTasks('grunt-ts');
	grunt.loadNpmTasks('grunt-mocha-test');
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-contrib-clean');

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		jshint: {
			options: grunt.util._.extend(grunt.file.readJSON('.jshintrc'), {
				reporter: './node_modules/jshint-path-reporter'
			}),
			support: {
				options: {
					node: true
				},
				src: ['Gruntfile.js', 'tasks/**/*.js']
			},
			lib: {
				options: {
					node: true
				},
				src: ['lib/**/*.js']
			}
		},
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
			test: {
				src: ['test/src/main/index.ts'],
				outDir: 'test/build/sub/'
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

	grunt.registerTask('lint', [
		'jshint'
	]);

	grunt.registerTask('prep', [
		'clean:tmp',
		'clean:test',
		'clean:cruft',
		'lint'
	]);

	grunt.registerTask('test', [
		'prep',
		'ts:test',
		'run'
	]);

	grunt.registerTask('run', [
		'clean:tmp',
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
