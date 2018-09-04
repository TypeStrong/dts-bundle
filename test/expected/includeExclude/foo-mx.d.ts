
declare module 'foo-mx' {
    import exp = require('foo-mx/lib/exported-sub');
    import mod1 = require('foo-mx///external1');
    export import Foo = require('foo-mx/Foo');
    export function run(foo?: Foo): Foo;
    export function flep(): exp.ExternalContainer;
    export function bar(): mod1.SomeType;
}

declare module 'foo-mx///external1' {
    export class SomeType {
        foo(): void;
    }
}

declare module 'foo-mx///external2' {
    export class AnotherType {
        foo(): void;
    }
}

declare module 'foo-mx/Foo' {
    class Foo {
            foo: string;
            constructor(secret?: string);
            /**
                * Bars the foo.
                */
            barFoo(): void;
            /** Foos the baz. */
            fooBaz(): void;
    }
    export = Foo;
}
