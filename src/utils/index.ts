import { faker } from '@faker-js/faker';

export function throttle(fn: (...arg: any[]) => any, delay = 16.6) {
  let start = 0;
  return (...arg: any[]) => {
    const cur = Date.now();
    if (cur - start > delay) {
      fn.apply(this, arg);
      start = cur;
    }
  };
}

export function generationList(count: number): Promise<unknown[]> {
  console.log('888');
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const list = new Array(count).fill(0).map((item, index) => ({
        index,
        h: Math.ceil(Math.random() * 250 + 50),
        // content:faker.lorem.lines({
        //   min:2,
        //   max:20
        // })
      }));
      resolve(list);
    }, 100);
  });
}
