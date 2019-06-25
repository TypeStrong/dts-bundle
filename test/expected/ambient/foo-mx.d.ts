// Dependencies for this module:
//   ambient1.d.ts
//   ambient2.d.ts
//   ../../src/ambient/mymodule.d.ts

declare module 'foo-mx' {
    export { MyInterface } from 'mymodule';
    export { Sup1 } from 'foo-mx/ambient1';
    export { Sup2 } from 'foo-mx/ambient2';
}

declare module 'foo-mx/ambient1' {
    module 'mymodule' {
        interface MyInterface {
            prop1: string;
        }
    }
    export interface Sup1 {
    }
}

declare module 'foo-mx/ambient2' {
    module 'mymodule' {
        interface MyInterface {
            prop2: string;
        }
    }
    export interface Sup2 {
    }
}

