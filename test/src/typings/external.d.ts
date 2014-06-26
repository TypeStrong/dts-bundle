// This example typing can be considered to have been installed
// using e.g. 'tsd' (Typescript Definition Manager).
//
// We don't want these external type definitions to end up in
// in 'our' typing, even though we may e.g. return such types.
//
// For now, it is expected that our end-users will include these
// dependent definitions themselves, such as usually already
// happens with e.g. node.d.ts.

// This one is used/returned from the index file
declare module "external1" {
	export class SomeType {
		foo(): void;
	}
}

// This one is used in a subdirectory
declare module "external2" {
	export class AnotherType {
		foo(): void;
	}
}
