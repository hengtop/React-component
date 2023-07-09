import React, { useEffect, useCallback, useState } from 'react';
import { generationList } from '@/utils';

import Scroll from './index';

export default function demo() {
  const [list, setList] = useState<unknown[]>([]);
  useEffect(() => {
    getList();
  }, []);

  const getList = useCallback(async () => {
    const list = await generationList(100000);
    setList(list);
    console.log('success');
  }, []);
  return (
    <Scroll
      list={list}
      estimateHeight={50}
      cacheCount={10}
      height={500}
    ></Scroll>
  );
}
