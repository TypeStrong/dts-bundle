import './sub.service.html';

export class SubService {
  
  constructor(public x: string){}
  
  hello(): string {
    return `Hello ${this.x}`;
  }
  
}
