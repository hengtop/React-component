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
  return new Promise((resolve) => {
    setTimeout(() => {
      const list = new Array(count).fill(0).map((item, index) => ({
        index,
        //h: Math.ceil(Math.random() * 250 + 50),
        content: Math.ceil(Math.random() * 270 + 100),
      }));
      resolve(list);
    }, 100);
  });
}
