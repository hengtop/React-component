import React, { useEffect, useCallback, useState } from 'react';
import { generationList } from '@/utils';

import Scroll from './index';

export default function demo() {
  const [list, setList] = useState<unknown[]>([]);
  useEffect(() => {
    getList();
  }, []);

  const getList = useCallback(async () => {
    const list = await generationList(10);
    setList(list);
  }, []);
  const handleScrollBottom = async (loadMore: (list: unknown[]) => void) => {
    const list = await generationList(10);
    loadMore(list);
  };
  return (
    <Scroll
      list={list}
      estimateHeight={60}
      cacheCount={1}
      height={500}
      children={(item, index) => (
        <div className="item">
          <h2>{index}</h2>
          {index}----{item.content}
        </div>
      )}
      onScrollBottom={handleScrollBottom}
    ></Scroll>
  );
}
