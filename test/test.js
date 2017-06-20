var fs = require('fs');
var path = require('path');
var glob = require('glob');
var chai = require('chai');
var mkdirp = require('mkdirp');
var ncp = require('ncp');

var execSync = require('child_process').execSync;
var util = require("util");

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
		var result = dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			newline: '\n',
            verbose: true,
            headerPath: "none"
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
        assert.isTrue(result.emitted, "not emit " + actualFile);
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

	testit('default_cli', function (actDir, expDir) {
        expDir = expDir.substr(0, expDir.length - 4); // expDir is the same without "_cli" suffix
        execSync(util.format("node ./lib/dts-bundle.js --name foo-mx --main %s --newline unix --verbose --headerPath none", path.join(actDir, 'index.d.ts')));
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
		var result = dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			removeSource: true,
			newline: '\n',
            verbose: true,
            headerPath: "none"
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
        assert.isTrue(result.emitted, "not emit " + actualFile);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('remove_cli', function (actDir, expDir) {
        expDir = expDir.substr(0, expDir.length - 4); // expDir is the same without "_cli" suffix
        execSync(util.format("node ./lib/dts-bundle --name foo-mx --main %s --removeSource --newline unix --verbose --headerPath none", path.join(actDir, 'index.d.ts')));
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('out', function (actDir, expDir) {
		var result = dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			out: path.join(actDir, 'fizz', 'buzz.d.ts'),
			newline: '\n',
            verbose: true,
            headerPath: "none"
		});
		var name = path.join('fizz', 'buzz.d.ts');
		var actualFile = path.join(actDir, name);
        assert.isTrue(result.emitted, "not emit " + actualFile);
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

	testit('out_cli', function (actDir, expDir) {
        expDir = expDir.substr(0, expDir.length - 4); // expDir is the same without "_cli" suffix
        execSync(util.format("node ./lib/dts-bundle --name foo-mx --main %s --out %s --newline unix --verbose --headerPath none",
            path.join(actDir, 'index.d.ts'),
            path.join(actDir, 'fizz', 'buzz.d.ts')));
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
		var result = dts.bundle({
			name: 'bar-mx',
			main: path.join(actDir, 'index.d.ts'),
			removeSource: true,
			prefix: '--',
			separator: '#',
			indent: '\t',
			newline: ' //$\n',
            verbose: true,
            headerPath: "none"
		});
		var name = 'bar-mx.d.ts';
		var actualFile = path.join(actDir, name);
        assert.isTrue(result.emitted, "not emit " + actualFile);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});

	testit('seprinnew_cli', function (actDir, expDir) {
        expDir = expDir.substr(0, expDir.length - 4); // expDir is the same without "_cli" suffix
        execSync(util.format("node ./lib/dts-bundle --configJson ./test/seprinnew_cli-config.json --name bar-mx --main %s --removeSource --verbose --headerPath none",
            path.join(actDir, 'index.d.ts'),
            path.join(actDir, 'fizz', 'buzz.d.ts')));
		var name = 'bar-mx.d.ts';
		var actualFile = path.join(actDir, name);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
    });

	testit('externals', function (actDir, expDir) {
		var result = dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			externals: true,
			newline: '\n',
            verbose: true,
            headerPath: "none"
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
        assert.isTrue(result.emitted, "not emit " + actualFile);
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

	testit('externals_cli', function (actDir, expDir) {
        expDir = expDir.substr(0, expDir.length - 4); // expDir is the same without "_cli" suffix
        execSync(util.format("node ./lib/dts-bundle --name foo-mx --main %s --externals --newline unix --verbose --headerPath none",
            path.join(actDir, 'index.d.ts')));
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
		var result = dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			exclude: /exported\-sub/,
			newline: '\n',
            verbose: true,
            headerPath: "none"
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
        assert.isTrue(result.emitted, "not emit " + actualFile);
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

	//testit('excludeExp_cli', function (actDir, expDir) {	}); // No exclude options available from CLI.

	testit('excludeFunc', function (actDir, expDir) {
		var result = dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			exclude: function(file) {
				return /exported\-sub/.test(file);
			},
			newline: '\n',
            verbose: true,
            headerPath: "none"
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
        assert.isTrue(result.emitted, "not emit " + actualFile);
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

   	//testit('excludeFunc_cli', function (actDir, expDir) {  }); // No exclude options available from CLI.

	testit('includeExclude', function (actDir, expDir) {
		var result = dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			externals: true,
			exclude: /exported\-sub/,
			newline: '\n',
            verbose: true,
            headerPath: "none"
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
        assert.isTrue(result.emitted, "not emit " + actualFile);
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

  	//testit('includeExclude_cli', function (actDir, expDir) {  }); // No exclude options available from CLI.

	(function testit(name, assertion, run) {
		var buildDir = path.resolve(__dirname, 'build', 'conflicts', 'dirname');
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
	})('conflicts_dirname', function (actDir, expDir) {
		var result = dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, 'index.d.ts'),
			newline: '\n',
            verbose: true,
            headerPath: "none"
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
        assert.isTrue(result.emitted, "not emit " + actualFile);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name,
			'index.d.ts',
			'file1.d.ts',
			'file1/file2.d.ts',
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
		var result = dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, '../es6', 'index.d.ts'),
            newline: '\n',
            verbose: true,
            headerPath: "none"
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
        assert.isTrue(result.emitted, "not emit " + actualFile);
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
	})('es6_cli', function (actDir, expDir) {
        expDir = expDir.substr(0, expDir.length - 4); // expDir is the same without "_cli" suffix
        execSync(util.format("node ./lib/dts-bundle --name foo-mx --main %s --newline unix --verbose --headerPath none",
            path.join(actDir, '../es6_cli', 'index.d.ts')));
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

	(function testit(name, assertion, run) {
		var buildDir = path.resolve(__dirname, 'build', 'commonjs');
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
	})('commonjs', function (actDir, expDir) {
		var result = dts.bundle({
			name: 'foo-mx',
			main: path.join(actDir, '../commonjs', 'index.d.ts'),
			newline: '\n',
			verbose: true,
			headerPath: "none"
		});
		var name = 'foo-mx.d.ts';
		var actualFile = path.join(actDir, name);
		assert.isTrue(result.emitted, "not emit " + actualFile);
		var expectedFile = path.join(expDir, name);
		assertFiles(actDir, [
			name,
			'index.d.ts',
			'sub/index.d.ts',
			'sub/sub.service.d.ts'
		]);
		assert.strictEqual(getFile(actualFile), getFile(expectedFile));
	});
});
