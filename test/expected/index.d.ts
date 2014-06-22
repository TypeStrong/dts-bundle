declare module 'foo-mx' {
    export import Foo = require('__foo-mx/Foo');
    export function run(foo?: Foo): Foo;
}

declare module '__foo-mx/Foo' {
    class Foo {
        foo: string;
        constructor(secret?: string);
    }
    export = Foo;
}

