import {SubService} from "./sub";
export {SubService};

export class mymod {
  
  public sub: SubService;
  
  constructor(){
    this.sub = new SubService("mymod");
  }
  
  getName(): string {
    return this.sub.hello();
  }
}
