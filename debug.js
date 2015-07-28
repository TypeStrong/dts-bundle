var dts = require("./lib");
var path = require("path");
var actDir = "test/tmp/includeExclude";

dts.bundle({
	name: 'foo-mx',
	main: path.join(actDir, 'index.d.ts'),
	externals: true,
	exclude: /exported\-sub/,
	newline: '\n'
});
