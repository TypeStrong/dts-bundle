
declare module 'foo-mx' {
    export * from 'foo-mx/file1';
    export * from 'foo-mx/file1/file2';
}

declare module 'foo-mx/file1' {
    export class Foo1 {
        property1: number;
        constructor();
    }
}

declare module 'foo-mx/file1/file2' {
    export class Foo2 {
        property2: string;
        constructor();
    }
}

