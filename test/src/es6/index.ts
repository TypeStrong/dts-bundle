export * from "./sub";
import subA from "./sub";
import * as subB from "./sub";
import subC, {A} from "./lib/subC";
import {bar} from "./lib/subD";
import {foo as buzz} from "./lib/subE";
import "./lib/subF";

export function indexA() {
	return subA();
}

export function indexB() {
	return new subB.B();
}

export function indexC() {
	return subC();
}

export function indexD() {
	return bar;
}

export function indexE() {
	return buzz;
}
