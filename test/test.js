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

describe('dts bundle', function () {
	before(function () {
		dts.bundle({
			name: 'foo-mx',
			main: path.join(tmpDir, 'index.d.ts')
		});
	});

	it('created files', function () {
		assert.isFile(path.join(tmpDir, 'index.js'));
		assert.isFile(path.join(tmpDir, 'index.d.ts'));
		assert.isFile(path.join(tmpDir, 'Foo.js'));
		assert.isFile(path.join(tmpDir, 'lib', 'barbazz.js'));
	});

	it('removed files', function () {
		assert.notPathExists(path.join(tmpDir, 'Foo.d.ts'));
		assert.notPathExists(path.join(tmpDir, 'lib', 'barbazz.d.ts'));
	});
});
