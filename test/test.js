var fs = require('fs');
var path = require('path');
var glob = require('glob');
var chai = require('chai');
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

describe('dts bundle', function () {

	function testit(name, assertion) {
		it('bundle ' + name, function (done) {
			var testDir = path.join(tmpDir, name);
			var expDir = path.join(expectDir, name);

			ncp.ncp(buildDir, testDir, function (err) {
				if (err) {
					done(err);
					return;
				}
				assertion(testDir, expDir);
				done();
			});
		});
	}

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
			removeTypings: true,
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
			newline: '\n'
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
			removeTypings: true,
			prefix: '--',
			separator: '#',
			indent: '        ',
			newline: '//$\n'
		});
		var name = 'bar-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('includeExternal', function (actDir, expDir) {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			includeExternal: true,
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

	testit('excludeTypingsExp', function (actDir, expDir) {
		dts.bundle({
			name: 'foo-mx',
			verbose: true,
			main: path.join(actDir, 'index.d.ts'),
			excludeTypingsExp: /exported-sub\.d\.ts/,
			newline: '\n'
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name,
			'index.d.ts',
			'Foo.d.ts',
			'lib/only-internal.d.ts'
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});
});
