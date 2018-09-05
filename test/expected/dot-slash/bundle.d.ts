
declare module 'bundle' {
    import { SomeOtherClass } from "bundle/SomeOtherClass";
    export interface IShouldBeThereOnlyOnce {
        name: string;
    }
    export function getOther(): SomeOtherClass;
}

declare module 'bundle/SomeOtherClass' {
    import { IShouldBeThereOnlyOnce } from "bundle/";
    export class SomeOtherClass {
        static saveTheWorld(once: IShouldBeThereOnlyOnce): Promise<any>;
    }
}

