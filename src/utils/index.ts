import type { Any } from '@/types';
import { faker } from '@faker-js/faker';

export function throttle(fn: (...arg: Any[]) => Any, delay = 16.6) {
  let start = 0;
  return (...arg: Any[]) => {
    const cur = Date.now();
    if (cur - start > delay) {
      // @ts-ignore
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

export function createTaskDispatch<T = unknown>(
  max = 5,
  callback: () => void,
  options = {},
) {
  const untouchedTasks: ((() => Promise<T>) | Promise<T>)[] = [];
  const size = max;

  const drainUntouchedTasks = () => {
    if (signal.aborted) throw new Error('dispatch aborted');
    while (max > 0 && untouchedTasks.length > 0) {
      let task = untouchedTasks.shift();
      task = typeof task === 'function' ? task() : task;
      max--;
      task &&
        task
          .catch((err) => {
            console.log('err', err);
          })
          .finally(() => {
            max++;
            drainUntouchedTasks();
          });
    }
    if (untouchedTasks.length <= 0 && max === size) {
      callback();
    }
  };

  return function dispatch(...task: ((() => Promise<T>) | Promise<T>)[]) {
    untouchedTasks.push(...task);
    drainUntouchedTasks();
  };
}
