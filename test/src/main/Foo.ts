class Foo {

    foo: string;
    private counter: number = 0;

    constructor(private secret?: string) {

    }

    /**
     * Bars the foo.
     */
    barFoo(): void {

    }
    /**
     * Foos the bar.
     */
    private fooBar(): void {

    }
    /** Foos the baz. */
    fooBaz(): void {

    }
}

export = Foo;
