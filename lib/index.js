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
        };
    }
    return function (line) {
        return String(line).replace(new RegExp('^' + actual + '+', 'g'), function (match) {
            return match.split(actual).join(use);
        });
    };
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
function bundle(options) {
    assert(typeof options === 'object' && options, 'options must be an object');
    var main = options.main;
    var exportName = options.name;
    var baseDir = optValue(options.baseDir, path.dirname(options.main));
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
    function trace() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i - 0] = arguments[_i];
        }
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
    var isExclude;
    if (typeof exclude === 'function') {
        isExclude = exclude;
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
    var sourceTypings = [];
    var excludedTypings = [];
    var externalTypings = [];
    var externalTypingsMap = Object.create(null);
    glob.sync('**/*.d.ts', {
        cwd: baseDir
    }).forEach(function (file) {
        sourceTypings.push(path.resolve(baseDir, file));
    });
    var sourceTypingsMap = Object.create(null);
    trace('source typings (will be included in output if actually used)');
    sourceTypings.forEach(function (file) {
        trace(' - %s ', file);
        sourceTypingsMap[file] = true;
    });
    trace('excluded typings (will always be excluded from output)');
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
        var queuedJSDoc = null;
        var inBlock = false;
        var popBlock = function () {
            if (multiComment.length > 0) {
                if (/^[ \t]*\/\*\*/.test(multiComment[0])) {
                    queuedJSDoc = multiComment;
                }
                else if (comments) {
                    multiComment.forEach(function (line) {
                        res.lines.push(line);
                    });
                }
                multiComment = [];
            }
            inBlock = false;
        };
        var popJSDoc = function () {
            if (queuedJSDoc) {
                queuedJSDoc.forEach(function (line) {
                    var match = line.match(/^([ \t]*)(\*.*)/);
                    if (match) {
                        res.lines.push(match[1] + ' ' + match[2]);
                    }
                    else {
                        res.lines.push(line);
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
                inBlock = true;
                return;
            }
            if (inBlock) {
                multiComment.push(line);
                return;
            }
            if (/^\s*$/.test(line)) {
                res.lines.push('');
                return;
            }
            if (/^\/\/\//.test(line)) {
                var ref = extractReference(line);
                if (ref) {
                    var refPath = path.resolve(path.dirname(file), ref);
                    if (sourceTypingsMap[refPath]) {
                        trace(' - reference source typing %s (%s)', ref, refPath);
                    }
                    else {
                        var relPath = path.relative(baseDir, refPath).replace(/\\/g, '/');
                        trace(' - reference external typing %s (%s) (relative: %s)', ref, refPath, relPath);
                        if (!externalTypingsMap[refPath]) {
                            externalTypings.push(refPath);
                            externalTypingsMap[refPath] = true;
                        }
                    }
                    pushUnique(res.refs, refPath);
                    return;
                }
            }
            if (/^\/\//.test(line)) {
                if (comments) {
                    res.lines.push(line);
                }
                return;
            }
            if (privateExp.test(line)) {
                queuedJSDoc = null;
                return;
            }
            popJSDoc();
            if ((match = line.match(importExp))) {
                assert(match[3]);
                var impPath = path.resolve(path.dirname(file), match[3]);
                if (fileExp.test(match[3])) {
                    var expName = getExpName(impPath);
                    line = [match[1] + match[2] + expName + match[4]];
                    res.lines.push(line);
                    var full = path.resolve(path.dirname(file), impPath + '.d.ts');
                    trace(' - import relative %s (%s)', match[3], full);
                    pushUnique(res.relativeImports, full);
                    res.importLineRef.push(line);
                }
                else {
                    line = [line];
                    res.lines.push(line);
                    trace(' - import external %s', match[3]);
                    pushUnique(res.externalImports, match[3]);
                    if (externals) {
                        res.importLineRef.push(line);
                    }
                }
            }
            else if ((match = line.match(externalExp))) {
                assert(match[3]);
                trace(' - declare %s', match[3]);
                pushUnique(res.exports, match[3]);
                line = [line];
                res.relativeRef.push(line);
                res.lines.push(line);
            }
            else {
                if ((match = line.match(publicExp))) {
                    line = match[1] + match[2] + match[4] + match[5];
                }
                if (sourceTypingsMap[file]) {
                    res.lines.push(line.replace(/^(export )?declare /g, '$1'));
                }
                else {
                    res.lines.push(line);
                }
            }
        });
        return res;
    }
    trace('\n### parse files ###');
    var queue = [mainFile];
    var queueSeen = Object.create(null);
    var fileMap = Object.create(null);
    var mainParse;
    var parse;
    while (queue.length > 0) {
        var target = queue.shift();
        if (queueSeen[target]) {
            continue;
        }
        queueSeen[target] = true;
        parse = parseFile(target);
        if (!mainParse) {
            mainParse = parse;
        }
        fileMap[parse.file] = parse;
        pushUniqueArr(queue, parse.refs, parse.relativeImports);
    }
    trace('\n### map exports ###');
    var exportMap = Object.create(null);
    Object.keys(fileMap).forEach(function (file) {
        parse = fileMap[file];
        parse.exports.forEach(function (name) {
            assert(!(name in exportMap), 'already got export for: ' + name);
            exportMap[name] = parse;
            trace('- %s -> %s', name, parse.file);
        });
    });
    trace('\n### determine typings to include ###');
    var queue2 = [mainParse];
    queueSeen = Object.create(null);
    var usedTypings = [];
    var externalDependencies = [];
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
            queue2.push(p);
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
            queue2.push(p);
        });
    }
    trace('\n### rewrite global external modules ###');
    usedTypings.forEach(function (parse) {
        trace(parse.name);
        parse.relativeRef.forEach(function (line, i) {
            var replaced = replaceExternal(String(line), getLibName);
            trace(' - %s  ==>  %s', line, replaced);
            parse.relativeRef[i][0] = replaced;
        });
        parse.importLineRef.forEach(function (line, i) {
            var replaced = replaceImportExport(String(line), getLibName);
            trace(' - %s  ==>  %s', line, replaced);
            parse.importLineRef[i][0] = replaced;
        });
    });
    trace('\n### build output ###');
    var content = '';
    content += '// Generated by dts-bundle v' + pkg.version + newline;
    if (externalDependencies.length > 0) {
        content += '// Dependencies for this module:' + newline;
        externalDependencies.forEach(function (file) {
            content += '//   ' + path.relative(baseDir, file).replace(/\\/g, '/') + newline;
        });
    }
    content += newline;
    var used = [];
    content += usedTypings.map(function (parse) {
        used.push(parse.file);
        if (sourceTypingsMap[parse.file]) {
            return formatModule(parse.file, parse.lines.map(getIndenter(parse.indent, indent)));
        }
        else {
            return parse.lines.map(getIndenter(parse.indent, indent)).join(newline) + newline;
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
    var outDir = path.dirname(outFile);
    if (!fs.existsSync(outDir)) {
        mkdirp.sync(outDir);
    }
    fs.writeFileSync(outFile, content, 'utf8');
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
