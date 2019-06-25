// Dependencies for this module:
//   ../../src/typings/external.d.ts

declare module 'foo-mx' {
    import exp = require('foo-mx/lib/exported-sub');
    import mod1 = require('external1');
    export import Foo = require('foo-mx/Foo');
    export function run(foo?: Foo): Foo;
    export function flep(): exp.ExternalContainer;
    export function bar(): mod1.SomeType;
/* INJECTED VIA transformModuleBody */
}

declare module 'foo-mx/lib/exported-sub' {
    import Foo = require('foo-mx/Foo');
    import mod2 = require('external2');
    export class ExternalContainer {
        something: mod2.AnotherType;
    }
    export function bar(foo: Foo): string;
    export function bazz(value: string, option?: boolean): string;
/* INJECTED VIA transformModuleBody */
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
/* INJECTED VIA transformModuleBody */
}
