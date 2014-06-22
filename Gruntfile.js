module.exports = function (grunt) {
	'use strict';

	grunt.loadNpmTasks('grunt-ts');
	grunt.loadNpmTasks('grunt-mocha-test');
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');

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
				src: ['Gruntfile.js', 'tasks/**/*.*.js']
			}
		},
		copy: {
			test: {
				files: [
					{expand: true, cwd: 'test/build', src: ['**'], dest: 'test/tmp'}
				]
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
				'tmp/**/*'
			],
			test: [
				'test/build/**/*',
				'test/tmp/**/*'
			]
		},
		ts: {
			options: {
				fast: 'never',
				target: 'es5',
				module: 'commonjs',
				declaration: true,
				sourceMap: false
			},
			test: {
				src: ['test/src/*.ts'],
				outDir: 'test/build/'
			}
		},
		mochaTest: {
			options: {
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
		'clean:cruft',
		'jshint:support'
	]);

	grunt.registerTask('test', [
		'prep',
		'ts:test',
		'dev'
	]);

	grunt.registerTask('dev', [
		'copy:test',
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
