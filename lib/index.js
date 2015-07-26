'use strict';
var os = require('os');
var fs = require('fs');
var path = require('path');
var util = require('util');
var assert = require('assert');
var glob = require('glob');
var mkdirp = require('mkdirp');
var detectIndent = require('detect-indent');
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
function bundle(options) {
    assert(typeof options === 'object' && options, 'options must be an object');
    var main = options.main;
    var exportName = options.name;
    var _baseDir = optValue(options.baseDir, path.dirname(options.main));
    var out = optValue(options.out, exportName + '.d.ts');
    var newline = optValue(options.newline, os.EOL);
    var indent = optValue(options.indent, '    ');
    var prefix = optValue(options.prefix, '__');
    var separator = optValue(options.separator, '/');
    var externals = optValue(options.externals, false);
    var exclude = optValue(options.exclude, null);
    var removeSource = optValue(options.removeSource, false);
    var comments = false;
    var verbose = optValue(options.verbose, false);
    assert.ok(main, 'option "main" must be defined');
    assert.ok(exportName, 'option "name" must be defined');
    assert(typeof newline === 'string', 'option "newline" must be a string');
    assert(typeof indent === 'string', 'option "indent" must be a string');
    assert(typeof prefix === 'string', 'option "prefix" must be a string');
    assert(separator.length > 0, 'option "separator" must have non-zero length');
    var baseDir = path.resolve(_baseDir);
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
    var isExclude;
    if (typeof exclude === 'function') {
        isExclude = exclude;
    }
    else if (exclude instanceof RegExp) {
        isExclude = function (file) { return exclude.test(file); };
    }
    else {
        isExclude = function () { return false; };
    }
    trace('\n### find typings ###');
    var sourceTypings = glob.sync('**/*.d.ts', {
        cwd: baseDir
    }).map(function (file) { return path.resolve(baseDir, file); });
    var inSourceTypings = function (file) { return sourceTypings.indexOf(file) !== -1; };
    trace('source typings (will be included in output if actually used)');
    sourceTypings.forEach(function (file) { return trace(' - %s ', file); });
    trace('excluded typings (will always be excluded from output)');
    var fileMap = Object.create(null);
    var mainParse;
    var externalTypings = [];
    var inExternalTypings = function (file) { return externalTypings.indexOf(file) !== -1; };
    {
        trace('\n### parse files ###');
        var queue = [mainFile];
        var queueSeen = Object.create(null);
        while (queue.length > 0) {
            var target = queue.shift();
            if (queueSeen[target]) {
                continue;
            }
            queueSeen[target] = true;
            var parse = parseFile(target);
            if (!mainParse) {
                mainParse = parse;
            }
            fileMap[parse.file] = parse;
            pushUniqueArr(queue, parse.refs, parse.relativeImports);
        }
    }
    trace('\n### map exports ###');
    var exportMap = Object.create(null);
    Object.keys(fileMap).forEach(function (file) {
        var parse = fileMap[file];
        parse.exports.forEach(function (name) {
            assert(!(name in exportMap), 'already got export for: ' + name);
            exportMap[name] = parse;
            trace('- %s -> %s', name, parse.file);
        });
    });
    trace('\n### determine typings to include ###');
    var excludedTypings = [];
    var usedTypings = [];
    var externalDependencies = [];
    {
        var queue = [mainParse];
        var queueSeen = Object.create(null);
        trace('queue');
        trace(queue);
        while (queue.length > 0) {
            var parse = queue.shift();
            if (queueSeen[parse.file]) {
                continue;
            }
            queueSeen[parse.file] = true;
            trace('%s (%s)', parse.name, parse.file);
            usedTypings.push(parse);
            parse.externalImports.forEach(function (name) {
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
                queue.push(p);
            });
            parse.relativeImports.forEach(function (file) {
                var p = fileMap[file];
                if (isExclude(path.relative(baseDir, p.file), false)) {
                    trace(' - exclude internal filter %s', file);
                    pushUnique(excludedTypings, p.file);
                    return;
                }
                trace(' - import relative %s', file);
                assert(p, file);
                queue.push(p);
            });
        }
    }
    trace('\n### rewrite global external modules ###');
    usedTypings.forEach(function (parse) {
        trace(parse.name);
        parse.relativeRef.forEach(function (line, i) {
            line.modified = replaceExternal(line.original, getLibName);
            trace(' - %s  ==>  %s', line.original, line.modified);
        });
        parse.importLineRef.forEach(function (line, i) {
            line.modified = replaceImportExport(line.original, getLibName);
            trace(' - %s  ==>  %s', line.original, line.modified);
        });
    });
    trace('\n### build output ###');
    var content = '// Generated by dts-bundle v' + pkg.version + newline;
    if (externalDependencies.length > 0) {
        content += '// Dependencies for this module:' + newline;
        externalDependencies.forEach(function (file) {
            content += '//   ' + path.relative(baseDir, file).replace(/\\/g, '/') + newline;
        });
    }
    content += newline;
    content += usedTypings.map(function (parse) {
        if (inSourceTypings(parse.file)) {
            return formatModule(parse.file, parse.lines.map(function (line) {
                return getIndenter(parse.indent, indent)(line);
            }));
        }
        else {
            return parse.lines.map(function (line) {
                return getIndenter(parse.indent, indent)(line);
            }).join(newline) + newline;
        }
    }).join(newline) + newline;
    if (removeSource) {
        trace('\n### remove source typings ###');
        sourceTypings.forEach(function (p) {
            if (p !== outFile && dtsExp.test(p) && fs.statSync(p).isFile()) {
                trace(' - %s', p);
                fs.unlinkSync(p);
            }
        });
    }
    trace('\n### write output ###');
    trace(outFile);
    {
        var outDir = path.dirname(outFile);
        if (!fs.existsSync(outDir)) {
            mkdirp.sync(outDir);
        }
    }
    fs.writeFileSync(outFile, content, 'utf8');
    if (verbose) {
        var inUsed = function (file) {
            return usedTypings.filter(function (parse) { return parse.file === file; }).length !== 0;
        };
        trace('\n### statistics ###');
        trace('used sourceTypings');
        sourceTypings.forEach(function (p) {
            if (inUsed(p)) {
                trace(' - %s', p);
            }
        });
        trace('unused sourceTypings');
        sourceTypings.forEach(function (p) {
            if (!inUsed(p)) {
                trace(' - %s', p);
            }
        });
        trace('excludedTypings');
        excludedTypings.forEach(function (p) {
            trace(' - %s', p);
        });
        trace('used external typings');
        externalTypings.forEach(function (p) {
            if (inUsed(p)) {
                trace(' - %s', p);
            }
        });
        trace('unused external typings');
        externalTypings.forEach(function (p) {
            if (!inUsed(p)) {
                trace(' - %s', p);
            }
        });
        trace('external dependencies');
        externalDependencies.forEach(function (p) {
            trace(' - %s', p);
        });
    }
    trace('\n### done ###\n');
    return;
    function trace() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
        if (verbose) {
            console.log(util.format.apply(null, args));
        }
    }
    function getModName(file) {
        return path.relative(baseDir, path.dirname(file) + path.sep + path.basename(file).replace(/\.d\.ts$/, ''));
    }
    function getExpName(file) {
        if (file === mainFile) {
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
    function formatModule(file, lines) {
        var out = '';
        out += 'declare module \'' + getExpName(file) + '\' {' + newline;
        out += (lines.length === 0 ? '' : indent + lines.join(newline + indent)) + newline;
        out += '}' + newline;
        return out;
    }
    function parseFile(file) {
        var name = getModName(file);
        trace('%s (%s)', name, file);
        var code = fs.readFileSync(file, 'utf8').replace(bomOptExp, '').replace(/\s*$/, '');
        var res = {
            file: file,
            name: name,
            indent: detectIndent(code) || indent,
            exp: getExpName(file),
            refs: [],
            externalImports: [],
            relativeImports: [],
            exports: [],
            lines: [],
            importLineRef: [],
            relativeRef: []
        };
        var multiComment = [];
        var queuedJSDoc;
        var inBlockComment = false;
        var popBlock = function () {
            if (multiComment.length > 0) {
                if (/^[ \t]*\/\*\*/.test(multiComment[0])) {
                    queuedJSDoc = multiComment;
                }
                else if (comments) {
                    multiComment.forEach(function (line) { return res.lines.push({ original: line }); });
                }
                multiComment = [];
            }
            inBlockComment = false;
        };
        var popJSDoc = function () {
            if (queuedJSDoc) {
                queuedJSDoc.forEach(function (line) {
                    var match = line.match(/^([ \t]*)(\*.*)/);
                    if (match) {
                        res.lines.push({ original: match[1] + ' ' + match[2] });
                    }
                    else {
                        res.lines.push({ original: line });
                    }
                });
                queuedJSDoc = null;
            }
        };
        code.split(/\r?\n/g).forEach(function (line) {
            var match;
            if (/^[((=====)(=*)) \t]*\*+\//.test(line)) {
                multiComment.push(line);
                popBlock();
                return;
            }
            if (/^[ \t]*\/\*/.test(line)) {
                multiComment.push(line);
                inBlockComment = true;
                return;
            }
            if (inBlockComment) {
                multiComment.push(line);
                return;
            }
            if (/^\s*$/.test(line)) {
                res.lines.push({ original: '' });
                return;
            }
            if (/^\/\/\//.test(line)) {
                var ref = extractReference(line);
                if (ref) {
                    var refPath = path.resolve(path.dirname(file), ref);
                    if (inSourceTypings(refPath)) {
                        trace(' - reference source typing %s (%s)', ref, refPath);
                    }
                    else {
                        var relPath = path.relative(baseDir, refPath).replace(/\\/g, '/');
                        trace(' - reference external typing %s (%s) (relative: %s)', ref, refPath, relPath);
                        if (!inExternalTypings(refPath)) {
                            externalTypings.push(refPath);
                        }
                    }
                    pushUnique(res.refs, refPath);
                    return;
                }
            }
            if (/^\/\//.test(line)) {
                if (comments) {
                    res.lines.push({ original: line });
                }
                return;
            }
            if (privateExp.test(line)) {
                queuedJSDoc = null;
                return;
            }
            popJSDoc();
            if ((match = line.match(importExp))) {
                var _ = match[0], lead = match[1], quote = match[2], moduleName = match[3], trail = match[4];
                assert(moduleName);
                var impPath = path.resolve(path.dirname(file), moduleName);
                if (fileExp.test(moduleName)) {
                    var modLine = {
                        original: lead + quote + getExpName(impPath) + trail
                    };
                    res.lines.push(modLine);
                    var full = path.resolve(path.dirname(file), impPath + '.d.ts');
                    trace(' - import relative %s (%s)', moduleName, full);
                    pushUnique(res.relativeImports, full);
                    res.importLineRef.push(modLine);
                }
                else {
                    var modLine = {
                        original: line
                    };
                    res.lines.push(modLine);
                    trace(' - import external %s', moduleName);
                    pushUnique(res.externalImports, moduleName);
                    if (externals) {
                        res.importLineRef.push(modLine);
                    }
                }
            }
            else if ((match = line.match(externalExp))) {
                var _ = match[0], declareModule = match[1], lead = match[2], moduleName = match[3], trail = match[4];
                assert(moduleName);
                trace(' - declare %s', moduleName);
                pushUnique(res.exports, moduleName);
                var modLine = {
                    original: line
                };
                res.relativeRef.push(modLine);
                res.lines.push(modLine);
            }
            else {
                if ((match = line.match(publicExp))) {
                    var _ = match[0], sp = match[1], static1 = match[2], pub = match[3], static2 = match[4], ident = match[5];
                    line = sp + static1 + static2 + ident;
                }
                if (inSourceTypings(file)) {
                    res.lines.push({ original: line.replace(/^(export )?declare /g, '$1') });
                }
                else {
                    res.lines.push({ original: line });
                }
            }
        });
        return res;
    }
}
exports.bundle = bundle;
function pushUnique(arr, value) {
    if (arr.indexOf(value) < 0) {
        arr.push(value);
    }
    return arr;
}
function pushUniqueArr(arr) {
    var values = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        values[_i - 1] = arguments[_i];
    }
    values.forEach(function (vs) { return vs.forEach(function (v) { return pushUnique(arr, v); }); });
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
        var _ = match[0], declareModule = match[1], beforeIndent = match[2], moduleName = match[3], afterIdent = match[4];
        assert(afterIdent);
        if (identifierExp.test(moduleName)) {
            return declareModule + beforeIndent + replacer(moduleName) + afterIdent;
        }
    }
    return line;
}
function getIndenter(actual, use) {
    if (actual === use || !actual) {
        return function (line) { return line.modified || line.original; };
    }
    return function (line) { return (line.modified || line.original).replace(new RegExp('^' + actual + '+', 'g'), function (match) { return match.split(actual).join(use); }); };
}
function optValue(passed, def) {
    if (typeof passed === 'undefined') {
        return def;
    }
    return passed;
}
function regexEscape(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}
