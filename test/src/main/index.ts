/// <reference path="./../typings/external.d.ts" />
/// <reference path="./../node_modules/modules.d.ts" />

import int = require('./lib/only-internal');
import exp = require('./lib/exported-sub');
import mod1 = require('external1');
import nodeModule = require('node_module');

export import Foo = require('./Foo');
/*
    Licence foo module v1.2.3 - MIT
*/
export function run(foo?: Foo): Foo {
    var foo = foo || new Foo();
    int.bazz(int.bar(foo));
    return foo;
}

// flep this
export function flep(): exp.ExternalContainer {
    return new exp.ExternalContainer();
}

// bar that
export function bar(): mod1.SomeType {
    return new mod1.SomeType();
}

// baz some of that
export function baz(): nodeModule.SomeType {
    return new nodeModule.SomeType();
}
