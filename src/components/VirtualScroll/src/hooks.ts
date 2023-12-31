import type { ICalculationList } from './index';
import type { Any } from '@/types';
import { useCallback, useRef } from 'react';

export const useScrollTool = () => {
  const sumHeight = useCallback(
    (list: ICalculationList[], start = 0, end = list.length) => {
      let height = 0;
      if (end > list.length) end = list.length;
      for (let i = start; i < end; i++) {
        height += list[i].domHeight;
      }
      return height;
    },
    [],
  );

  const findIndexOverHeight = useCallback(
    (list: ICalculationList[], offset: number) => {
      let currentHeight = 0;
      for (let i = 0; i < list.length; i++) {
        currentHeight += list[i].domHeight;
        if (currentHeight > offset) {
          return i;
        }
      }
      return list.length - 1;
    },
    [],
  );

  // function binarySearch() {
  //   let left = 0;
  //   let right = list.length - 1;
  //   let index = -1;
  //   while (left <= right) {
  //     const mid = Math.floor((left + right) / 2);
  //     if (list[mid] > offset) {
  //       index = mid;
  //       right = mid - 1;
  //     } else {
  //       left = mid + 1;
  //     }
  //   }
  //   return index === -1 ? list.length - 1 : index;
  // }

  const withinCache = useCallback(
    (
      currentHead: number,
      currentTail: number,
      renderCacheHead: number,
      renderCacheTail: number,
    ) => {
      const withinRange = (num: number, min: number, max: number) =>
        num >= min && num < max;

      return (
        withinRange(currentHead, renderCacheHead, renderCacheTail) &&
        withinRange(currentTail, renderCacheHead, renderCacheTail)
      );
    },
    [],
  );

  const updateRefState = <T extends Record<string, Any>>(
    obj: T,
  ): [T, (object: Partial<T>) => void] => {
    const ref = useRef<T>(obj);
    const setRefState = (object: Partial<T>) => {
      Object.assign(ref.current, object);
    };
    return [ref.current, setRefState];
  };

  return { sumHeight, findIndexOverHeight, withinCache, updateRefState };
};
