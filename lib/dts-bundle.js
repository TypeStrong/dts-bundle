#!/usr/bin/env node

// Remember remove \r chars at end of lines. 

var pkg = require('../package');
var program = require('commander');
var dts = require("./index");
var path = require('path');
var os = require('os');

function mapOptions(argObj) {
    var result = argObj.configJson ? require(path.resolve(argObj.configJson)) : {};

    var optList = [
        "main",
        "name",
        "baseDir",
        "out",
    //"newline", // Manual
    //"indent", // not implemented
        "prefix",
//        "separator", not implemented
        "externals",
    //"exclude", // not implemented
        "removeSource",
        "verbose",
        "referenceExternals",
        "emitOnIncludedFileNotFound",
        "emitOnNoIncludedFileNotFound",
        "outputAsModuleFolder",
        "headerPath"
    ];

    optList.forEach(function (optName) {
        if (argObj.hasOwnProperty(optName))
            result[optName] = argObj[optName];
    }, this);

    if (argObj.hasOwnProperty("newline")) {
        switch (argObj.newline) {
            case "unix":
                result.newline = "\n";
                break;
            case "windows":
                result.newline = "\r\n";
                break;
            case "currentOsDefault":
                result.newline = os.EOL;
                break;
        }
    }
    return result;
}

function callBundle(options) {
    if (!options.name || !options.main) {
        console.log("'name' and 'main' parameters are required. --help for get option list.")
        process.exit(1);
    }
    return dts.bundle(options);
}

program
    .version(pkg.version)
    .option('--configJson <value>', "path to json config file. Load it first and override options with additional parameters")
    .option('--name <value>', 'name of module likein package.json *required')
    .option('--main <value>', 'path to entry-point (see documentation) *required')
    .option('--baseDir [value]', 'base directory to be used for discovering type declarations')
    .option('--out [value]', 'path of output file. Is relative from baseDir but you can use absolute paths. ')
    .option('--externals', 'include typings outside of the "baseDir" (i.e. like node.d.ts)')
    .option('--referenceExternals', 'reference external modules as <reference path="..." /> tags *** Experimental, TEST NEEDED')
//.option('--exclude ', 'filter to exclude typings, either a RegExp or a callback. match path relative to opts.baseDir')
    .option('--removeSource', 'delete all source typings (i.e. "<baseDir>/**/*.d.ts")')
    .option('--newline [style]', 'newline style to use in output file => unix|windows|currentOsDefault', /^(unix|windows|currentOsDefault)$/i)
//.option('--indent', 'indentation to use in output file')
    .option('--prefix [value]', 'prefix for rewriting module names')
//    .option('--separator [value]', 'separator for rewriting module "path" names')
    .option('--verbose', 'enable verbose mode, prints detailed info about all references and includes/excludes')
    .option('--emitOnIncludedFileNotFound', 'emit although included files not found. See readme "Files not found" section. ')
    .option('--emitOnNoIncludedFileNotFound', 'emit although no included files not found. See readme "Files not found" section. ')
    .option('--outputAsModuleFolder', 'output as module folder format (no declare module) . See readme "Module folders" section.')
    .option('--headerPath [value]', 'path to file that contains the header')
    .parse(process.argv);

console.log("%s version %s\n%s\n", pkg.name, pkg.version, pkg.description);

var options = mapOptions(program);

var result = callBundle(options);

if (!result.emitted) {
    console.log("Result no emitted - use verbose to see details.");
    process.exit(1);
}
  