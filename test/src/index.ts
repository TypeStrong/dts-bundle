import barbazz = require('./lib/barbazz');

export import Foo = require('./Foo');

export function run (foo?: Foo): Foo {
    var foo = foo || new Foo();
    barbazz.bazz(barbazz.bar(foo));
    return foo;
}
