
declare module 'foo-mx' {
    const _default: import('foo-mx/lib').Plugin;
    export default _default;
}

declare module 'foo-mx/lib' {
    export interface Plugin {
        name: string
        action: any
    }
}

