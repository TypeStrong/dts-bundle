
declare module 'foo-mx' {
    export * from "foo-mx/sub";
    import * as subB from "foo-mx/sub";
    import { A } from "foo-mx/lib/subC";
    import { bar } from "foo-mx/lib/subD";
    import { foo as buzz } from "foo-mx/lib/subE";
    import "foo-mx/lib/subF";
    export function indexA(): subB.A;
    export function indexB(): subB.B;
    export function indexC(): A;
    export function indexD(): typeof bar;
    export function indexE(): typeof buzz;
}

declare module 'foo-mx/sub' {
    export interface A {
        name: string;
    }
    export class B {
        name: string;
    }
    export default function test(): A;
    export function foo(): A;
    export function bar(): A;
}

declare module 'foo-mx/lib/subC' {
    export interface A {
        name: string;
    }
    export class B {
        name: string;
    }
    export default function test(): A;
    export function foo(): A;
    export function bar(): A;
}

declare module 'foo-mx/lib/subD' {
    export interface A {
        name: string;
    }
    export class B {
        name: string;
    }
    export default function test(): A;
    export function foo(): A;
    export function bar(): A;
}

declare module 'foo-mx/lib/subE' {
    export interface A {
        name: string;
    }
    export class B {
        name: string;
    }
    export default function test(): A;
    export function foo(): A;
    export function bar(): A;
}

declare module 'foo-mx/lib/subF' {
    export interface A {
        name: string;
    }
    export class B {
        name: string;
    }
    export default function test(): A;
    export function foo(): A;
    export function bar(): A;
}

