'use strict';

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as assert from 'assert';
import * as glob from 'glob';
import * as mkdirp from 'mkdirp';
import * as detectIndent from 'detect-indent';

let pkg = require('../package');

const dtsExp = /\.d\.ts$/;
const bomOptExp = /^\uFEFF?/;

const externalExp = /^([ \t]*declare module )(['"])(.+?)(\2[ \t]*{?.*)$/;
const importExp = /^([ \t]*(?:export )?(?:import .+? )= require\()(['"])(.+?)(\2\);.*)$/;
const importEs6Exp = /^([ \t]*(?:export|import) ?(?:(?:\* (?:as [^ ,]+)?)|.*)?,? ?(?:[^ ,]+ ?,?)(?:\{(?:[^ ,]+ ?,?)*\})? ?from )(['"])([^ ,]+)(\2;.*)$/;
const referenceTagExp = /^[ \t]*\/\/\/[ \t]*<reference[ \t]+path=(["'])(.*?)\1?[ \t]*\/>.*$/;
const identifierExp = /^\w+(?:[\.-]\w+)*$/;
const fileExp = /^([\./].*|.:.*)$/;
const privateExp = /^[ \t]*(?:static )?private (?:static )?/;
const publicExp = /^([ \t]*)(static |)(public |)(static |)(.*)/;

export interface Options {
    main: string;
    name: string;
    baseDir?: string;
    out?: string;
    newline?: string;
    indent?: string;
    prefix?: string;
    separator?: string;
    externals?: boolean;
    exclude?: { (file: string): boolean; } | RegExp;
    removeSource?: boolean;
    verbose?: boolean;
    referenceExternals?: boolean;
}

export interface ModLine {
    original: string;
    modified?: string;
}

export interface Result {
    file: string;
    name: string;
    indent: string;
    exp: string;
    refs: string[];
    externalImports: string[];
    relativeImports: string[];
    exports: string[];
    lines: ModLine[];
    importLineRef: ModLine[];
    relativeRef: ModLine[];
    fileExists: boolean;
}

export function bundle(options: Options) {
    assert(typeof options === 'object' && options, 'options must be an object');

    // option parsing & validation
    const main = options.main;
    const exportName = options.name;
    const _baseDir = optValue(options.baseDir, path.dirname(options.main));
    const out = optValue(options.out, exportName + '.d.ts').replace(/\//g, path.sep);

    const newline = optValue(options.newline, os.EOL);
    const indent = optValue(options.indent, '    ');
    const prefix = optValue(options.prefix, '__');
    const separator = optValue(options.separator, '/');

    const externals = optValue(options.externals, false);
    const exclude = optValue(options.exclude, null);
    const removeSource = optValue(options.removeSource, false);
    const referenceExternals = optValue(options.referenceExternals, false);

    // regular (non-jsdoc) comments are not actually supported by declaration compiler
    const comments = false;

    const verbose = optValue(options.verbose, false);

    assert.ok(main, 'option "main" must be defined');
    assert.ok(exportName, 'option "name" must be defined');

    assert(typeof newline === 'string', 'option "newline" must be a string');
    assert(typeof indent === 'string', 'option "indent" must be a string');
    assert(typeof prefix === 'string', 'option "prefix" must be a string');
    assert(separator.length > 0, 'option "separator" must have non-zero length');

    // turn relative paths into absolute paths
    const baseDir = path.resolve(_baseDir);
    const mainFile = path.resolve(main.replace(/\//g, path.sep));
    const outFile = calcOutFilePath(out, baseDir);

    trace('### settings object passed ###');
    traceObject(options);

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

    let isExclude: (file: string, arg?: boolean) => boolean;
    if (typeof exclude === 'function') {
        isExclude = <any>exclude;
    }
    else if (exclude instanceof RegExp) {
        isExclude = file => exclude.test(file);
    }
    else {
        isExclude = () => false;
    }

    trace('\n### find typings ###');

    const sourceTypings = glob.sync('**/*.d.ts', { cwd: baseDir }).map(file => path.resolve(baseDir, file));
    const inSourceTypings = (file: string) => sourceTypings.indexOf(file) !== -1;

    trace('source typings (will be included in output if actually used)');

    sourceTypings.forEach(file => trace(' - %s ', file));

    trace('excluded typings (will always be excluded from output)');

    let fileMap: { [name: string]: Result; } = Object.create(null);
    let mainParse: Result; // will be parsed result of first parsed file
    let externalTypings: string[] = [];
    let inExternalTypings = (file: string) => externalTypings.indexOf(file) !== -1;
    {
        // recursively parse files, starting from main file,
        // following all references and imports
        trace('\n### parse files ###');

        let queue: string[] = [mainFile];
        let queueSeen: { [name: string]: boolean; } = Object.create(null);

        while (queue.length > 0) {
            let target = queue.shift();
            if (queueSeen[target]) {
                continue;
            }
            queueSeen[target] = true;

            // parse the file
            let parse = parseFile(target);
            if (!mainParse) {
                mainParse = parse;
            }
            fileMap[parse.file] = parse;
            pushUniqueArr(queue, parse.refs, parse.relativeImports);
        }
    }

    // map all exports to their file
    trace('\n### map exports ###');

    let exportMap = Object.create(null);
    Object.keys(fileMap).forEach(file => {
        let parse = fileMap[file];
        parse.exports.forEach(name => {
            assert(!(name in exportMap), 'already got export for: ' + name);
            exportMap[name] = parse;
            trace('- %s -> %s', name, parse.file);
        });
    });

    // build list of typings to include in output later
    trace('\n### determine typings to include ###');

    let excludedTypings: string[] = [];
    let usedTypings: Result[] = [];
    let externalDependencies: string[] = []; // lists all source files that we omit due to !externals
    {
        let queue = [mainParse];
        let queueSeen: { [name: string]: boolean; } = Object.create(null);

        trace('queue');
        trace(queue);

        while (queue.length > 0) {
            let parse = queue.shift();
            if (queueSeen[parse.file]) {
                continue;
            }
            queueSeen[parse.file] = true;

            trace('%s (%s)', parse.name, parse.file);

            usedTypings.push(parse);

            parse.externalImports.forEach(name => {
                let p = exportMap[name];
                if (!externals) {
                    trace(' - exclude external %s', name);
                    pushUnique(externalDependencies, !p ? name : p.file);
                    return;
                }
                if (isExclude(path.relative(baseDir, p.file), true)) {
                    trace(' - exclude external filter %s', name);
                    pushUnique(excludedTypings, p.file);
                    return;
                }
                trace(' - include external %s', name);
                assert(p, name);
                queue.push(p);
            });
            parse.relativeImports.forEach(file => {
                let p = fileMap[file];
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

    // rewrite global external modules to a unique name
    trace('\n### rewrite global external modules ###');

    usedTypings.forEach(parse => {
        trace(parse.name);

        parse.relativeRef.forEach((line, i) => {
            line.modified = replaceExternal(line.original, getLibName);
            trace(' - %s  ==>  %s', line.original, line.modified);
        });

        parse.importLineRef.forEach((line, i) => {
            if (importExp.test(line.original)) {
                line.modified = replaceImportExport(line.original, getLibName);
            } else {
                line.modified = replaceImportExportEs6(line.original, getLibName);
            }
            trace(' - %s  ==>  %s', line.original, line.modified);
        });
    });

    // build collected content
    trace('\n### build output ###');

    let content = '// Generated by dts-bundle v' + pkg.version + newline;
    if (externalDependencies.length > 0) {
        content += '// Dependencies for this module:' + newline;
        externalDependencies.forEach(file => {
            if (referenceExternals) {
                content += formatReference(path.relative(baseDir, file).replace(/\\/g, '/')) + newline;
            }
            else {
                content += '//   ' + path.relative(baseDir, file).replace(/\\/g, '/') + newline;
            }
        });
    }

    content += newline;

    // content += header.stringify(header.importer.packageJSON(pkg)).join(lb) + lb;
    // content += lb;

    // add wrapped modules to output
    content += usedTypings.map(parse => {
        if (inSourceTypings(parse.file)) {
            return formatModule(parse.file, parse.lines.map(line => {
                return getIndenter(parse.indent, indent)(line);
            }));
        }
        else {
            return parse.lines.map(line => {
                return getIndenter(parse.indent, indent)(line);
            }).join(newline) + newline;
        }
    }).join(newline) + newline;

    // remove internal typings, except the 'regenerated' main typing
    if (removeSource) {
        trace('\n### remove source typings ###');

        sourceTypings.forEach(p => {
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

    {
        let outDir = path.dirname(outFile);
        if (!fs.existsSync(outDir)) {
            mkdirp.sync(outDir);
        }
    }

    fs.writeFileSync(outFile, content, 'utf8');

    let inUsed = (file: string): boolean => {
        return usedTypings.filter(parse => parse.file === file).length !== 0;
    };
        
    // print some debug info
    if (verbose) {
        trace('\n### statistics ###');

        trace('used sourceTypings');
        sourceTypings.forEach(p => {
            if (inUsed(p)) {
                trace(' - %s', p);
            }
        });

        trace('unused sourceTypings');
        sourceTypings.forEach(p => {
            if (!inUsed(p)) {
                trace(' - %s', p);
            }
        });

        trace('excludedTypings');
        excludedTypings.forEach(p => {
            trace(' - %s', p);
        });

        trace('used external typings');
        externalTypings.forEach(p => {
            if (inUsed(p)) {
                trace(' - %s', p);
            }
        });

        trace('unused external typings');
        externalTypings.forEach(p => {
            if (!inUsed(p)) {
                trace(' - %s', p);
            }
        });

        trace('external dependencies');
        externalDependencies.forEach(p => {
            trace(' - %s', p);
        });
    }

    trace('files not found');
    for (let p in fileMap) {
        let parse = fileMap[p];
        if (!parse.fileExists) {
            if (inUsed(parse.file)) {
                warning(' X Included file NOT FOUND %s ', parse.file)
            } else {
                trace(' X Not used file not found %s', parse.file);
            }
        }
    }

    trace('\n### done ###\n');
    return;

    function stringStartsWith(str: string, prefix:string) {
        return str.slice(0, prefix.length) == prefix;
    }

    // Calculate out file path (see #26 https://github.com/TypeStrong/dts-bundle/issues/26)
    function calcOutFilePath(out: any, baseDir: any) {
        var result = path.resolve(baseDir, out);
        // if path start with ~, out parameter is relative from current dir
        if (stringStartsWith(out, "~" + path.sep)) {
            result = path.resolve(".", out.substr(2));
        }
        return result;
    }

    function traceObject(obj: any) {
        if (verbose) {
            console.log(obj);
        }
    }

    function trace(...args: any[]) {
        if (verbose) {
            console.log(util.format.apply(null, args));
        }
    }

    function warning(...args: any[]) {
        console.log(util.format.apply(null, args));
    }

    function getModName(file: string) {
        return path.relative(baseDir, path.dirname(file) + path.sep + path.basename(file).replace(/\.d\.ts$/, ''));
    }

    function getExpName(file: string) {
        if (file === mainFile) {
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
        let out = '';
        out += 'declare module \'' + getExpName(file) + '\' {' + newline;
        out += (lines.length === 0 ? '' : indent + lines.join(newline + indent)) + newline;
        out += '}' + newline;
        return out;
    }

    // main info extractor
    function parseFile(file: string): Result {
        const name = getModName(file);

        trace('%s (%s)', name, file);

        const res: Result = {
            file: file,
            name: name,
            indent: indent,
            exp: getExpName(file),
            refs: [], // triple-slash references
            externalImports: [], // import()'s like "events"
            relativeImports: [], // import()'s like "./foo"
            exports: [],
            lines: [],
            fileExists: true,
            // the next two properties contain single-element arrays, which reference the same single-element in .lines,
            // in order to be able to replace their contents later in the bundling process.
            importLineRef: [],
            relativeRef: []
        };

        if (!fs.existsSync(file)) {
            trace(' X - File not found: %s', file);
            res.fileExists = false;
            return res;
        }
        const code = fs.readFileSync(file, 'utf8').replace(bomOptExp, '').replace(/\s*$/, '');
        res.indent = detectIndent(code) || indent;

        // buffer multi-line comments, handle JSDoc
        let multiComment: string[] = [];
        let queuedJSDoc: string[];
        let inBlockComment = false;
        const popBlock = () => {
            if (multiComment.length > 0) {
                // jsdoc
                if (/^[ \t]*\/\*\*/.test(multiComment[0])) {
                    // flush but hold
                    queuedJSDoc = multiComment;
                }
                else if (comments) {
                    // flush it
                    multiComment.forEach(line => res.lines.push({ original: line }));
                }
                multiComment = [];
            }
            inBlockComment = false;
        };
        const popJSDoc = () => {
            if (queuedJSDoc) {
                queuedJSDoc.forEach(line => {
                    // fix shabby TS JSDoc output
                    let match = line.match(/^([ \t]*)(\*.*)/);
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

        code.split(/\r?\n/g).forEach(line => {
            let match: string[];

            // block comment end
            if (/^[((=====)(=*)) \t]*\*+\//.test(line)) {
                multiComment.push(line);
                popBlock();
                return;
            }

            // block comment start
            if (/^[ \t]*\/\*/.test(line)) {
                multiComment.push(line);
                inBlockComment = true;
								
                // single line block comment
                if (/\*+\/[ \t]*$/.test(line)) {
                    popBlock();
                }
                return;
            }

            if (inBlockComment) {
                multiComment.push(line);
                return;
            }

            // blankline
            if (/^\s*$/.test(line)) {
                res.lines.push({ original: '' });
                return;
            }

            // reference tag
            if (/^\/\/\//.test(line)) {
                let ref = extractReference(line);
                if (ref) {
                    let refPath = path.resolve(path.dirname(file), ref);
                    if (inSourceTypings(refPath)) {
                        trace(' - reference source typing %s (%s)', ref, refPath);
                    } else {
                        let relPath = path.relative(baseDir, refPath).replace(/\\/g, '/');

                        trace(' - reference external typing %s (%s) (relative: %s)', ref, refPath, relPath);

                        if (!inExternalTypings(refPath)) {
                            externalTypings.push(refPath);
                        }
                    }
                    pushUnique(res.refs, refPath);
                    return;
                }
            }

            // line comments
            if (/^\/\//.test(line)) {
                if (comments) {
                    res.lines.push({ original: line });
                }
                return;
            }

            // private member
            if (privateExp.test(line)) {
                queuedJSDoc = null;
                return;
            }
            popJSDoc();

            // import() statement or es6 import
            if ((match = line.match(importExp) || line.match(importEs6Exp))) {
                const [_, lead, quote, moduleName, trail] = match;
                assert(moduleName);

                const impPath = path.resolve(path.dirname(file), moduleName);

                // filename (i.e. starts with a dot, slash or windows drive letter)
                if (fileExp.test(moduleName)) {
                    // TODO: some module replacing is handled here, whereas the rest is
                    // done in the "rewrite global external modules" step. It may be
                    // more clear to do all of it in that step.
                    let modLine: ModLine = {
                        original: lead + quote + getExpName(impPath) + trail
                    };
                    res.lines.push(modLine);

                    const full = path.resolve(path.dirname(file), impPath + '.d.ts');
                    trace(' - import relative %s (%s)', moduleName, full);

                    pushUnique(res.relativeImports, full);
                    res.importLineRef.push(modLine);
                }
                // identifier
                else {
                    let modLine: ModLine = {
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

            // declaring an external module
            // this triggers when we're e.g. parsing external module declarations, such as node.d.ts
            else if ((match = line.match(externalExp))) {
                let [_, declareModule, lead, moduleName, trail] = match;
                assert(moduleName);

                trace(' - declare %s', moduleName);
                pushUnique(res.exports, moduleName);
                let modLine: ModLine = {
                    original: line
                };
                res.relativeRef.push(modLine); // TODO
                res.lines.push(modLine);
            }
            // clean regular lines
            else {
                // remove public keyword
                if ((match = line.match(publicExp))) {
                    let [_, sp, static1, pub, static2, ident] = match;
                    line = sp + static1 + static2 + ident;
                }
                if (inSourceTypings(file)) {
                    // for internal typings, remove the 'declare' keyword (but leave 'export' intact)
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
    let match = tag.match(referenceTagExp);
    if (match) {
        return match[2];
    }
    return null;
}

function replaceImportExport(line: string, replacer: (str: string) => string) {
    let match = line.match(importExp);
    if (match) {
        assert(match[4]);
        if (identifierExp.test(match[3])) {
            return match[1] + match[2] + replacer(match[3]) + match[4];
        }
    }
    return line;
}

function replaceImportExportEs6(line: string, replacer: (str: string) => string) {
    let match = line.match(importEs6Exp);
    if (match) {
        assert(match[4]);
        if (identifierExp.test(match[3])) {
            return match[1] + match[2] + replacer(match[3]) + match[4];
        }
    }
    return line;
}

function replaceExternal(line: string, replacer: (str: string) => string) {
    let match = line.match(externalExp);
    if (match) {
        let [_, declareModule, beforeIndent, moduleName, afterIdent] = match;
        assert(afterIdent);
        if (identifierExp.test(moduleName)) {
            return declareModule + beforeIndent + replacer(moduleName) + afterIdent;
        }
    }
    return line;
}

function getIndenter(actual: string, use: string): (line: ModLine) => string {
    if (actual === use || !actual) {
        return line => line.modified || line.original;
    }
    return line => (line.modified || line.original).replace(new RegExp('^' + actual + '+', 'g'), match => match.split(actual).join(use));
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
