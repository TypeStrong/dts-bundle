import Foo = require('../Foo');

export function bar(foo:Foo):string {
    return foo.foo + '-bar';
}

export function bazz(value:string, option?: boolean):string {
    return value + '-bazz';
}
