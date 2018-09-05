'use strict';

import {SomeOtherClass} from "./SomeOtherClass";

const other: SomeOtherClass = new SomeOtherClass();

export interface IShouldBeThereOnlyOnce {
  name: string,
}

export function getOther(): SomeOtherClass {
  return null;
}
