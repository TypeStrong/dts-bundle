var fs = require('fs');
var path = require('path');
var glob = require('glob');
var chai = require('chai');
var mkdirp = require('mkdirp');
var ncp = require('ncp');

chai.use(require('chai-fs'));
chai.config.includeStack = true;

var assert = chai.assert;

var dts = require('../index');

var baseDir = __dirname;
var buildDir = path.resolve(__dirname, 'build', 'sub');
var expectDir = path.resolve(__dirname, 'expected');
var tmpDir = path.resolve(__dirname, 'tmp');

var bomOptExp = /^\uFEFF?/;

function getFile(f) {
	return fs.readFileSync(f, 'utf8').replace(bomOptExp, '').replace(/\s*$/, '');
}

function fixPaths(arr) {
	return arr.map(function(p) {
		return p.replace('/', path.sep);
	}).sort();
}

function assertFiles(base, expHave, expNot) {
	var have = fixPaths(glob.sync('**/*.d.ts', {cwd: base}));

	assert.deepEqual(have, fixPaths(expHave), base);
}

function testit(name, assertion, run) {
	var call = function (done) {
		var testDir = path.join(tmpDir, name);
		var expDir = path.join(expectDir, name);

		mkdirp.sync(testDir);

		ncp.ncp(buildDir, testDir, function (err) {
			if (err) {
				done(err);
				return;
			}
			assertion(testDir, expDir);
			done();
		});
	};

	var label = 'bundle ' + name;

	if (run === 'skip') {
		it.skip(label, call);
	}
	else if (run === 'only') {
		it.only(label, call);
	}
	else {
		it(label, call);
	}
}

describe('dts bundle', function () {

	testit('default', function (actDir, expDir) {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			newline: '\n'
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name,
			'index.d.ts',
			'Foo.d.ts',
			'lib/exported-sub.d.ts',
			'lib/only-internal.d.ts'
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('remove', function (actDir, expDir) {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			removeSource: true,
			newline: '\n'
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('out', function (actDir, expDir) {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			out: path.join(actDir, 'fizz', 'buzz.d.ts'),
			newline: '\n',
            verbose: true
		});
		var name = path.join('fizz', 'buzz.d.ts');
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name,
			'index.d.ts',
			'Foo.d.ts',
			'lib/exported-sub.d.ts',
			'lib/only-internal.d.ts'
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('seprinnew', function (actDir, expDir) {
		dts.bundle({
			name: 'bar-mx',
			main: path.join(actDir, 'index.d.ts'),
			removeSource: true,
			prefix: '--',
			separator: '#',
			indent: '\t',
			newline: ' //$\n'
		});
		var name = 'bar-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('externals', function (actDir, expDir) {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			externals: true,
			newline: '\n'
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name,
			'index.d.ts',
			'Foo.d.ts',
			'lib/exported-sub.d.ts',
			'lib/only-internal.d.ts'
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('excludeExp', function (actDir, expDir) {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			exclude: /exported\-sub/,
			newline: '\n'
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name,
			'index.d.ts',
			'Foo.d.ts',
			'lib/exported-sub.d.ts',
			'lib/only-internal.d.ts'
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('excludeFunc', function (actDir, expDir) {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			exclude: function(file) {
				return /exported\-sub/.test(file);
			},
			newline: '\n'
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name,
			'index.d.ts',
			'Foo.d.ts',
			'lib/exported-sub.d.ts',
			'lib/only-internal.d.ts'
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('includeExclude', function (actDir, expDir) {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			externals: true,
			exclude: /exported\-sub/,
			newline: '\n'
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name,
			'index.d.ts',
			'Foo.d.ts',
			'lib/exported-sub.d.ts',
			'lib/only-internal.d.ts'
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	(function testit(name, assertion, run) {
		var buildDir = path.resolve(__dirname, 'build', 'es6');
		var call = function (done) {
			var testDir = path.join(tmpDir, name);
			var expDir = path.join(expectDir, name);

			mkdirp.sync(testDir);

			ncp.ncp(buildDir, testDir, function (err) {
				if (err) {
					done(err);
					return;
				}
				assertion(testDir, expDir);
				done();
			});
		};

		var label = 'bundle ' + name;

		if (run === 'skip') {
			it.skip(label, call);
		}
		else if (run === 'only') {
			it.only(label, call);
		}
		else {
			it(label, call);
		}
	})('es6', function (actDir, expDir) {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, '../es6', 'index.d.ts'),
            newline: '\n'
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name,
			'index.d.ts',
			'lib/subC.d.ts',
			'lib/subD.d.ts',
			'lib/subE.d.ts',
			'sub.d.ts'
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});
});
