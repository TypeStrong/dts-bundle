'use strict';

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as assert from 'assert';
import * as glob from 'glob';
import * as mkdirp from 'mkdirp';
import * as detectIndent from 'detect-indent';

var pkg = require('../package');

var dtsExp = /\.d\.ts$/;
var bomOptExp = /^\uFEFF?/;

var externalExp = /^([ \t]*declare module )(['"])(.+?)(\2[ \t]*{?.*)$/;
var importExp = /^([ \t]*(?:export )?(?:import .+? )= require\()(['"])(.+?)(\2\);.*)$/;
var referenceTagExp = /^[ \t]*\/\/\/[ \t]*<reference[ \t]+path=(["'])(.*?)\1?[ \t]*\/>.*$/;
var identifierExp = /^\w+(?:[\.-]\w+)*$/;
var fileExp = /^([\./].*|.:.*)$/;
var privateExp = /^[ \t]*(?:static )?private (?:static )?/;
var publicExp = /^([ \t]*)(static |)(public )(static |)(.*)/;

function pushUnique<T>(arr: T[], value: T) {
	if (arr.indexOf(value) < 0) {
		arr.push(value);
	}
	return arr;
}

function pushUniqueArr<T>(arr: T[], ...values: T[][]) {
	values.forEach(vs => vs.forEach(v => pushUnique(arr, v)));
	return arr;
}

function formatReference(file: string) {
	return '/// <reference path="' + file.replace(/\\/g, '/') + '" />';
}

function extractReference(tag: string) {
	var match = tag.match(referenceTagExp);
	if (match) {
		return match[2];
	}
	return null;
}

function replaceImportExport(line: string, replacer: (str: string) => string) {
	var match = line.match(importExp);
	if (match) {
		assert(match[4]);
		if (identifierExp.test(match[3])) {
			return match[1] + match[2] + replacer(match[3]) + match[4];
		}
	}
	return line;
}

function replaceExternal(line: string, replacer: (str: string) => string) {
	var match = line.match(externalExp);
	if (match) {
		assert(match[4]);
		if (identifierExp.test(match[3])) {
			return match[1] + match[2] + replacer(match[3]) + match[4];
		}
	}
	return line;
}

function getIndenter(actual: string, use: string) {
	if (actual === use || !actual) {
		return function (line: any) {
			return String(line);
		};
	}
	return function (line: any) {
		return String(line).replace(new RegExp('^' + actual + '+', 'g'), function (match) {
			return match.split(actual).join(use);
		});
	};
}

function optValue<T>(passed: T, def: T): T {
	if (typeof passed === 'undefined') {
		return def;
	}
	return passed;
}

function regexEscape(s: string) {
	return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

interface Options {
	main: string;
	name: string;
	baseDir?: string;
	out?: string;
	newline?: string;
	indent?: string;
	prefix?: string;
	separator?: string;
	externals?: boolean;
	exclude?: {(file: string): boolean} | RegExp;
	removeSource?: boolean;
	verbose?: boolean;
}

interface Result {
	file: string;
	name: string;
	indent: string;
	exp: string;
	refs: string[];
	externalImports: string[];
	relativeImports: string[];
	exports: string[];
	lines: string[];
	importLineRef: string[][];
	relativeRef: string[];
}

function bundle(options: Options) {
	assert(typeof options === 'object' && options, 'options must be an object');

	// option parsing & validation
	var main = options.main;
	var exportName = options.name;
	var baseDir = optValue(options.baseDir, path.dirname(options.main));
	var out = optValue(options.out, exportName + '.d.ts');

	var newline = optValue(options.newline, os.EOL);
	var indent = optValue(options.indent, '    ');
	var prefix = optValue(options.prefix, '__');
	var separator = optValue(options.separator, '/');

	var externals = optValue(options.externals, false);
	var exclude = optValue<{(file: string): boolean} | RegExp>(options.exclude, null);
	var removeSource = optValue(options.removeSource, false);

	// regular (non-jsdoc) comments are not actually supported by declaration compiler
	var comments = false;

	var verbose = optValue(options.verbose, false);

	function trace(...args: any[]) {
		if (verbose) {
			console.log(util.format.apply(null, args));
		}
	}

	assert.ok(main, 'option "main" must be defined');
	assert.ok(exportName, 'option "name" must be defined');

	assert(typeof newline === 'string', 'option "newline" must be a string');
	assert(typeof indent === 'string', 'option "indent" must be a string');
	assert(typeof prefix === 'string', 'option "prefix" must be a string');
	assert(separator.length > 0, 'option "separator" must have non-zero length');

	// turn relative paths into absolute paths
	baseDir = path.resolve(baseDir);
	var mainFile = path.resolve(main.replace(/\//g, path.sep));
	var outFile = path.resolve(baseDir, out.replace(/\//g, path.sep));

	trace('### settings ###');
	trace('main:         %s', main);
	trace('name:         %s', exportName);
	trace('out:          %s', out);
	trace('baseDir:      %s', baseDir);
	trace('mainFile:     %s', mainFile);
	trace('outFile:      %s', outFile);
	trace('externals:    %s', externals ? 'yes' : 'no');
	trace('exclude:      %s', exclude);
	trace('removeSource: %s', removeSource ? 'yes' : 'no');
	trace('comments:     %s', comments ? 'yes' : 'no');

	assert(fs.existsSync(mainFile), 'main does not exist: ' + mainFile);

	var isExclude: (file: string, arg?: boolean) => boolean;
	if (typeof exclude === 'function') {
		isExclude = <any>exclude;
	}
	else if (exclude instanceof RegExp) {
		isExclude = function (file) {
			return exclude.test(file);
		};
	}
	else {
		isExclude = function () {
			return false;
		};
	}

	trace('\n### find typings ###');

	var sourceTypings: string[] = [];
	var excludedTypings: string[] = [];

	var externalTypings: string[] = [];
	var externalTypingsMap: {[name: string]: boolean;} = Object.create(null);

	glob.sync('**/*.d.ts', {
		cwd: baseDir
	}).forEach(file => {
		sourceTypings.push(path.resolve(baseDir, file));
	});

	var sourceTypingsMap: {[name: string]: boolean;} = Object.create(null);

	trace('source typings (will be included in output if actually used)');

	sourceTypings.forEach(file => {
		trace(' - %s ', file);
		sourceTypingsMap[file] = true;
	});

	trace('excluded typings (will always be excluded from output)');

	function getModName(file: string) {
		return path.relative(baseDir, path.dirname(file) + path.sep + path.basename(file).replace(/\.d\.ts$/, ''));
	}

	function getExpName(file: string) {
		var isMain = (file === mainFile);
		if (isMain) {
			return exportName;
		}
		return getExpNameRaw(file);
	}

	function getExpNameRaw(file: string) {
		return prefix + exportName + separator + cleanupName(getModName(file));
	}

	function getLibName(ref: string) {
		return getExpNameRaw(mainFile) + separator + prefix + separator + ref;
	}

	function cleanupName(name: string) {
		return name.replace(/\.\./g, '--').replace(/[\\\/]/g, separator);
	}

	function formatModule(file: string, lines: string[]) {
		var out = '';
		out += 'declare module \'' + getExpName(file) + '\' {' + newline;
		out += (lines.length === 0 ? '' : indent + lines.join(newline + indent)) + newline;
		out += '}' + newline;
		return out;
	}

	// main info extractor
	function parseFile(file: string): Result {
		var name = getModName(file);

		trace('%s (%s)', name, file);

		var code = fs.readFileSync(file, 'utf8').replace(bomOptExp, '').replace(/\s*$/, '');

		var res: Result = {
			file: file,
			name: name,
			indent: detectIndent(code) || indent,
			exp: getExpName(file),
			refs: [], // triple-slash references
			externalImports: [], // import()'s like "events"
			relativeImports: [], // import()'s like "./foo"
			exports: [],
			lines: [],
			// the next two properties contain single-element arrays, which reference the same single-element in .lines,
			// in order to be able to replace their contents later in the bundling process.
			importLineRef: [],
			relativeRef: []
		};

		// buffer multi-line comments, handle JSDoc
		var multiComment: string[] = [];
		var queuedJSDoc: string[] = null;
		var inBlock = false;
		var popBlock = () => {
			if (multiComment.length > 0) {
				// jsdoc
				if (/^[ \t]*\/\*\*/.test(multiComment[0])){
					// flush but hold
					queuedJSDoc = multiComment;
				}
				else if (comments) {
					// flush it
					multiComment.forEach(function (line) {
						res.lines.push(line);
					});
				}
				multiComment = [];
			}
			inBlock = false;
		};
		var popJSDoc = () => {
			if (queuedJSDoc) {
				queuedJSDoc.forEach(line => {
					// fix shabby TS JSDoc output
					var match = line.match(/^([ \t]*)(\*.*)/);
					if (match){
						res.lines.push(match[1] + ' ' + match[2]);
					}
					else {
						res.lines.push(line);
					}
				});
				queuedJSDoc = null;
			}
		};

		code.split(/\r?\n/g).forEach(line => {
			var match: string[];

			// block comment end
			if (/^[((=====)(=*)) \t]*\*+\//.test(line)) {
				multiComment.push(line);
				popBlock();
				return;
			}

			// block comment start
			if (/^[ \t]*\/\*/.test(line)) {
				multiComment.push(line);
				inBlock = true;
				return;
			}

			if (inBlock) {
				multiComment.push(line);
				return;
			}

			// blankline
			if (/^\s*$/.test(line)) {
				res.lines.push('');
				return;
			}

			// reference tag
			if (/^\/\/\//.test(line)) {
				var ref = extractReference(line);
				if (ref) {
					var refPath = path.resolve(path.dirname(file), ref);
					if (sourceTypingsMap[refPath]) {
						trace(' - reference source typing %s (%s)', ref, refPath);
					} else {
						var relPath = path.relative(baseDir, refPath).replace(/\\/g, '/');

						trace(' - reference external typing %s (%s) (relative: %s)', ref, refPath, relPath);

						if (!externalTypingsMap[refPath]) {
							externalTypings.push(refPath);
							externalTypingsMap[refPath] = true;
						}
						//}
					}
					pushUnique(res.refs, refPath);
					return;
				}
			}

			// line comments
			if (/^\/\//.test(line)) {
				if (comments) {
					res.lines.push(line);
				}
				return;
			}

			// private member
			if (privateExp.test(line)) {
				queuedJSDoc = null;
				return;
			}
			popJSDoc();

			// import() statement
			if ((match = line.match(importExp))) {
				assert(match[3]);

				var impPath = path.resolve(path.dirname(file), match[3]);

				// filename (i.e. starts with a dot, slash or windows drive letter)
				if (fileExp.test(match[3])) {
					// TODO: some module replacing is handled here, whereas the rest is
					// done in the "rewrite global external modules" step. It may be
					// more clear to do all of it in that step.
					var expName = getExpName(impPath);
					line = <any>[match[1] + match[2] + expName + match[4]];
					res.lines.push(<any>line);

					var full = path.resolve(path.dirname(file), impPath + '.d.ts');
					trace(' - import relative %s (%s)', match[3], full);

					pushUnique(res.relativeImports, full);
					res.importLineRef.push(<any>line);
				}
				// identifier
				else {
					line = <any>[line];
					res.lines.push(line);
					trace(' - import external %s', match[3]);

					pushUnique(res.externalImports, match[3]);
					if (externals) {
						res.importLineRef.push(<any>line);
					}
				}
			}
			// declaring an external module
			// this triggers when we're e.g. parsing external module declarations, such as node.d.ts
			else if ((match = line.match(externalExp))) {
				assert(match[3]);

				trace(' - declare %s', match[3]);
				pushUnique(res.exports, match[3]);
				line = <any>[line];
				res.relativeRef.push(<any>line); // TODO
				res.lines.push(line);
			}
			// clean regular lines
			else {
				// remove public keyword
				if ((match = line.match(publicExp))) {
					line = match[1] + match[2] + match[4] + match[5];
				}
				if (sourceTypingsMap[file]) {
					// for internal typings, remove the 'declare' keyword (but leave 'export' intact)
					res.lines.push(line.replace(/^(export )?declare /g, '$1'));
				}
				else {
					res.lines.push(line);
				}
			}
		});

		return res;
	}

	// recursively parse files, starting from main file,
	// following all references and imports
	trace('\n### parse files ###');

	var queue = [mainFile];
	var queueSeen: {[name: string]: boolean;} = Object.create(null);
	var fileMap: {[name:string]: Result;} = Object.create(null);
	var mainParse: Result; // will be parsed result of first parsed file
	var parse: Result; // temp var

	while (queue.length > 0) {
		var target = queue.shift();
		if (queueSeen[target]) {
			continue;
		}
		queueSeen[target] = true;

		// parse the file
		parse = parseFile(target);
		if (!mainParse) {
			mainParse = parse;
		}
		fileMap[parse.file] = parse;
		pushUniqueArr<string>(queue, parse.refs, parse.relativeImports);
	}

	// map all exports to their file
	trace('\n### map exports ###');

	var exportMap = Object.create(null);
	Object.keys(fileMap).forEach(file => {
		parse = fileMap[file];
		parse.exports.forEach(name => {
			assert(!(name in exportMap), 'already got export for: ' + name);
			exportMap[name] = parse;
			trace('- %s -> %s', name, parse.file);
		});
	});

	// build list of typings to include in output later
	trace('\n### determine typings to include ###');

	var queue2 = [mainParse];
	queueSeen = Object.create(null);

	var usedTypings: Result[] = [];
	var externalDependencies: string[] = []; // lists all source files that we omit due to !externals

	trace('queue');
	trace(queue2);

	while (queue2.length > 0) {
		parse = queue2.shift();
		if (queueSeen[parse.file]) {
			continue;
		}
		queueSeen[parse.file] = true;

		trace('%s (%s)', parse.name, parse.file);

		usedTypings.push(parse);

		parse.externalImports.forEach(name => {
			var p = exportMap[name];
			if (isExclude(path.relative(baseDir, p.file), true)) {
				trace(' - exclude external filter %s', name);
				pushUnique(excludedTypings, p.file);
				return;
			}
			if (!externals) {
				trace(' - exclude external%s', name);
				pushUnique(externalDependencies, p.file);
				return;
			}
			trace(' - include external %s', name);
			assert(p, name);
			queue2.push(p);
		});
		parse.relativeImports.forEach(file => {
			var p = fileMap[file];
			if (isExclude(path.relative(baseDir, p.file), false)) {
				trace(' - exclude internal filter %s', file);
				pushUnique(excludedTypings, p.file);
				return;
			}
			trace(' - import relative %s', file);
			assert(p, file);
			queue2.push(p);
		});
	}

	// rewrite global external modules to a unique name
	trace('\n### rewrite global external modules ###');

	usedTypings.forEach(parse => {
		trace(parse.name);

		parse.relativeRef.forEach((line, i) => {
			var replaced = replaceExternal(String(line), getLibName);
			trace(' - %s  ==>  %s', line, replaced);
			parse.relativeRef[i][0] = replaced;
		});

		parse.importLineRef.forEach((line, i) => {
			var replaced = replaceImportExport(String(line), getLibName);
			trace(' - %s  ==>  %s', line, replaced);
			parse.importLineRef[i][0] = replaced;
		});
	});

	// build collected content
	trace('\n### build output ###');

	var content = '';

	content += '// Generated by dts-bundle v' + pkg.version + newline;
	if (externalDependencies.length > 0) {
		content += '// Dependencies for this module:' + newline;
		externalDependencies.forEach(function (file) {
			content += '//   ' + path.relative(baseDir, file).replace(/\\/g, '/')  + newline;
		});
	}

	content += newline;

	// content += header.stringify(header.importer.packageJSON(pkg)).join(lb) + lb;
	// content += lb;

	// add wrapped modules to output
	var used: string[] = [];

	content += usedTypings.map(function (parse) {
		used.push(parse.file);

		if (sourceTypingsMap[parse.file]) {
			return formatModule(parse.file, parse.lines.map(getIndenter(parse.indent, indent)));
		}
		else {
			return parse.lines.map(getIndenter(parse.indent, indent)).join(newline) + newline;
		}
	}).join(newline) + newline;

	// remove internal typings, except the 'regenerated' main typing
	if (removeSource) {
		trace('\n### remove source typings ###');

		sourceTypings.forEach(function (p) {
			// safety check, only delete .d.ts files, leave our outFile intact for now
			if (p !== outFile && dtsExp.test(p) && fs.statSync(p).isFile()) {
				trace(' - %s', p);
				fs.unlinkSync(p);
			}
		});
	}

	// write main file
	trace('\n### write output ###');
	trace(outFile);

	var outDir = path.dirname(outFile);
	if (!fs.existsSync(outDir)) {
		mkdirp.sync(outDir);
	}

	fs.writeFileSync(outFile, content, 'utf8');

	// print some debug info
	if (verbose) {
		trace('\n### statistics ###');

		trace('used sourceTypings');
		sourceTypings.forEach(function (p) {
			if (used.indexOf(p) > -1) {
				trace(' - %s', p);
			}
		});

		trace('unused sourceTypings');
		sourceTypings.forEach(function (p) {
			if (used.indexOf(p) < 0) {
				trace(' - %s', p);
			}
		});

		trace('excludedTypings');
		excludedTypings.forEach(function (p) {
			trace(' - %s', p);
		});

		trace('used external typings');
		externalTypings.forEach(function (p) {
			if (used.indexOf(p) > -1) {
				trace(' - %s', p);
			}
		});

		trace('unused external typings');
		externalTypings.forEach(function (p) {
			if (used.indexOf(p) < 0) {
				trace(' - %s', p);
			}
		});

		trace('external dependencies');
		externalDependencies.forEach(function (p) {
			trace(' - %s', p);
		});
	}

	trace('\n### done ###\n');
}

module.exports = {
	bundle: bundle
};
