'use strict';

var os = require('os');
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var glob = require('glob');
var detectIndent = require('detect-indent');

var dtsExp = /\.d\.ts$/;
var bomOptExp = /^\uFEFF?/;

var externalExp = /^([ \t]*declare module )(['"])(.+?)(\2[ \t]*{?.*)$/;
var importExp = /^([ \t]*(?:export )?(?:import .+? )= require\()(['"])(.+?)(\2\);.*)$/;
var referenceTagExp = /^[ \t]*\/\/\/[ \t]*<reference[ \t]+path=(["'])(.*?)\1?[ \t]*\/>.*$/;
var identifierExp = /^\w+(?:[\.-]\w+)*$/;
var privateExp = /^[ \t]*(?:static )?private (?:static )?/;
var publicExp = /^([ \t]*)(static |)(public )(static |)(.*)/;

function pushUnique(arr, value) {
	if (arr.indexOf(value) < 0) {
		arr.push(value);
	}
	return arr;
}

function pushUniqueArr(arr, values) {
	for (var a = 1; a < arguments.length; a++) {
		var tmp = arguments[a];
		for (var i = 0, ii = tmp.length; i < ii; i++) {
			var v = tmp[i];
			if (arr.indexOf(v) < 0) {
				arr.push(v);
			}
		}
	}
	return arr;
}

function shiftUnique(arr, value) {
	if (arr.indexOf(value) < 0) {
		arr.shift(value);
	}
	return arr;
}

function shiftUniqueArr(arr, values) {
	for (var a = 1; a < arguments.length; a++) {
		var tmp = arguments[a];
		for (var i = 0, ii = tmp.length; i < ii; i++) {
			var v = tmp[i];
			if (arr.indexOf(v) < 0) {
				arr.shift(v);
			}
		}
	}
	return arr;
}

function formatReference(file) {
	return '/// <reference path="' + file.replace(/\\/g, '/') + '" />';
}

function extractReference(tag) {
	var match = tag.match(referenceTagExp);
	if (match) {
		return match[2];
	}
	return null;
}

function replaceImportExport(line, replacer) {
	var match = line.match(importExp);
	if (match) {
		assert(match[4]);
		if (identifierExp.test(match[3])) {
			return match[1] + match[2] + replacer(match[3]) + match[4];
		}
	}
	return line;
}

function replaceExternal(line, replacer) {
	var match = line.match(externalExp);
	if (match) {
		assert(match[4]);
		if (identifierExp.test(match[3])) {
			return match[1] + match[2] + replacer(match[3]) + match[4];
		}
	}
	return line;
}

function getIndenter(actual, use) {
	if (actual === use || !actual) {
		return function (line) {
			return String(line);
		}
	}
	return function (line) {
		return String(line).replace(new RegExp('^' + actual + '+', 'g'), function (match) {
			return match.split(actual).join(use);
		});
	}
}

function optValue(passed, def) {
	if (typeof passed === 'undefined') {
		return def;
	}
	return passed;
}

function bundle(options) {
	assert(typeof options === 'object' && options, 'options must be an object');

	var main = options.main;
	var exportName = options.name;
	var newline = optValue(options.newline, os.EOL);
	var indent = optValue(options.indent, '    ');
	var prefix = optValue(options.prefix, '__');
	var separator = optValue(options.separator, '/');

	assert.ok(main, 'option "main" must be defined');
	assert.ok(exportName, 'option "exportName" must be defined');

	assert(typeof newline === 'string', 'option "newline" must be a string');
	assert(typeof indent === 'string', 'option "indent" must be a string');
	assert(typeof prefix === 'string', 'option "prefix" must be a string');
	assert(separator.length > 0, 'option "separator" must have non-zero length');

	// main file
	var mainFile = path.resolve(main.replace(/\//g, path.sep));
	var baseDir = path.dirname(mainFile);

	assert(fs.existsSync(mainFile), 'main does not exist: ' + mainFile);

	var selected = glob.sync('**/*.d.ts', {
		cwd: baseDir
	}).map(function (file) {
		return path.resolve(baseDir, file);
	}).filter(function (file) {
		return file !== mainFile;
	});

	// enclosed helpers
	function getModName(file) {
		return path.relative(baseDir, path.dirname(file) + path.sep + path.basename(file).replace(/\.d\.ts$/, ''));
	}

	function getExpName(file) {
		var isMain = (file === mainFile);
		if (isMain) {
			return exportName;
		}
		return getExpNameRaw(file);
	}

	function getExpNameRaw(file) {
		return prefix + exportName + separator + cleanupName(getModName(file));
	}

	function getLibName(ref) {
		return getExpNameRaw(mainFile) + separator + prefix + separator + ref;
	}

	function cleanupName(name) {
		return name.replace(/\.\./g, '--').replace(/[\\\/]/g, separator);
	}

	function getReferenceBundle(bundle, refs) {
		var base = path.basename(bundle);
		return refs.map(function (ref) {
			return formatReference(path.relative(base, ref));
		}).join(newline) + newline;
	}

	function formatModule(file, lines) {
		var out = '';
		out += 'declare module \'' + getExpName(file) + '\' {' + newline;
		out += (lines.length === 0 ? '' : indent + lines.join(newline + indent)) + newline;
		out += '}' + newline;
		return out;
	}

	// main info extractor
	function parseFile(file) {
		var name = getModName(file);
		var code = fs.readFileSync(file, 'utf8').replace(bomOptExp, '').replace(/\s*$/, '');

		var res = {
			file: file,
			name: name,
			indent: detectIndent(code) || indent,
			exp: getExpName(file),
			refs: [],
			relates: [],
			exports: [],
			imports: [],
			lines: [],
			// these can hold either string ro single-element arrays
			importLineRef: [],
			relativeRef: []
		};

		code.split(/\r?\n/g).forEach(function (line) {
			// blankline
			if (/^\s*$/.test(line)) {
				res.lines.push('');
				return;
			}
			// reference tag
			if (/^\/\/\//.test(line)) {
				var ref = extractReference(line);
				if (ref) {
					pushUnique(res.refs, path.resolve(path.dirname(file), ref));
					return;
				}
			}
			// private member
			if (privateExp.test(line)) {
				return;
			}

			var match;

			// import statement
			if ((match = line.match(importExp))) {
				assert(match[3]);

				var impPath = path.resolve(path.dirname(file), match[3]);

				// identifier
				if (identifierExp.test(match[3])) {
					line = [line];
					res.lines.push(line);
					pushUnique(res.imports, match[3]);
				}
				// filename
				else {
					var expName = getExpName(impPath);
					line = [match[1] + match[2] + expName + match[4]];
					res.lines.push(line);

					var full = path.resolve(path.dirname(file), impPath + '.d.ts');
					pushUnique(res.relates, full);
				}
				res.importLineRef.push(line);
			}
			// declaring an external module
			else if ((match = line.match(externalExp))) {
				assert(match[3]);

				pushUnique(res.exports, match[3]);
				line = [line];
				res.relativeRef.push(line);
				res.lines.push(line);
			}
			// clean regular lines
			else {
				// remove public keyword
				if ((match = line.match(publicExp))) {
					line = match[1] + match[2] + match[4] + match[5];
				}
				// allow it
				if (file === mainFile || selected.indexOf(file) > -1) {
					res.lines.push(line.replace(/^(export )?declare /g, '$1'));
				}
				else {
					res.lines.push(line);
				}
			}
		});

		return res;
	}

	// collections
	var fileMap = Object.create(null);
	var exportMap = Object.create(null);

	// parse the main file
	var mainParse = parseFile(mainFile);
	fileMap[mainParse.file] = mainParse;

	var collect = [];
	var used = [];
	var have = [mainFile];
	var queue = pushUniqueArr([], mainParse.refs, mainParse.relates);

	var parse;

	// process all files and follow imports and references
	while (queue.length > 0) {
		var target = queue.shift();
		if (have.indexOf(target) > -1) {
			continue;
		}
		have.push(target);

		// parse the file
		parse = parseFile(target);
		fileMap[parse.file] = parse;
		pushUniqueArr(queue, parse.refs, parse.relates);
	}

	// map all exports to their file
	Object.keys(fileMap).forEach(function (file) {
		var parse = fileMap[file];
		parse.exports.forEach(function (name) {
			assert(!(name in exportMap), 'already got export for: ' + name);
			exportMap[name] = parse;
		});
	});

	// process references
	collect = [mainParse];
	queue = [mainParse];

	while (queue.length > 0) {
		parse = queue.shift();

		parse.imports.forEach(function (name) {
			var p = exportMap[name];
			pushUnique(queue, p);
			pushUnique(collect, p);
		});
		parse.relates.forEach(function (file) {
			var p = fileMap[file];
			pushUnique(queue, p);
			pushUnique(collect, p);
		});
	}

	// rewrite global external modules to a unique name
	collect.forEach(function (parse) {
		parse.relativeRef.forEach(function (line, i) {
			parse.relativeRef[i][0] = replaceExternal(String(line), getLibName);
		});
		parse.importLineRef.forEach(function (line, i) {
			parse.importLineRef[i][0] = replaceImportExport(String(line), getLibName);
		});
	});

	// output collected content
	var out = '';
	// out += header.stringify(header.importer.packageJSON(pkg)).join(lb) + lb;
	// out += lb;

	// add wrapped modules to output
	out += collect.map(function (parse) {
		used.push(parse.file);
		if (parse === mainParse || selected.indexOf(parse.file) > -1) {
			return formatModule(parse.file, parse.lines.map(getIndenter(parse.indent, indent)));
		}
		else {
			return parse.lines.map(getIndenter(parse.indent, indent)).join(newline) + newline;
		}
	}).join(newline) + newline;

	// print some debug info
	/*
	 console.log('selected');
	 console.log(selected.map(function (p) {
	 return ' - ' + p;
	 }).join('\n'));
	 console.log('used');
	 console.log(used.map(function (p) {
	 return ' - ' + p;
	 }).join('\n'));
	 console.log('unused');
	 console.log(selected.filter(function (p) {
	 return used.indexOf(p) < 0;
	 }).map(function (p) {
	 return ' - ' + p;
	 }).join('\n'));
	 */

	// removed cruft
	selected.map(function (p) {
		// safety
		if (p !== mainFile && dtsExp.test(p) && fs.statSync(p).isFile()) {
			fs.unlinkSync(p)
		}
	});

	// write main file
	fs.writeFileSync(mainFile, out, 'utf8');
}

module.exports = {
	bundle: bundle
};
