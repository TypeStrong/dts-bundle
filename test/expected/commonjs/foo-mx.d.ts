
declare module 'foo-mx' {
    import { SubService } from "foo-mx/sub";
    export { SubService };
    export class mymod {
        sub: SubService;
        constructor();
        getName(): string;
    }
}

declare module 'foo-mx/sub' {
    export * from 'foo-mx/sub/sub.service';
}

declare module 'foo-mx/sub/sub.service' {
    import './sub.service.html';
    export class SubService {
        x: string;
        constructor(x: string);
        hello(): string;
    }
}

