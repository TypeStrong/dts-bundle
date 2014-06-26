var fs = require('fs');
var path = require('path');
var chai = require('chai');

chai.use(require('chai-fs'));
chai.config.includeStack = true;

var assert = chai.assert;

var dts = require('../index');

var baseDir = __dirname;
var expectDir = path.resolve(__dirname, 'expected');
var tmpDir = path.resolve(__dirname, 'tmp');

var bomOptExp = /^\uFEFF?/;

function getFile(f) {
	return fs.readFileSync(f, 'utf8').replace(bomOptExp, '').replace(/\s*$/, '');
}

describe('dts bundle', function () {
	before(function () {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(tmpDir, 'index.d.ts'),
		});
	});

	it('generated expected typing', function () {
		var actualFile = path.join(tmpDir, 'foo-mx.d.ts');
		var expectedFile = path.join(expectDir, 'foo-mx.d.ts');
		assert.isFile(actualFile);
		assert.deepEqual(getFile(actualFile), getFile(expectedFile));
	});
});
