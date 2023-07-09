import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import { throttle } from '@/utils';
import './index.less';
import { useScrollTool } from './hooks';

export interface IScrollProps {
  list: any[];
  estimateHeight?: number;
  cacheCount?: number;
  height?: number;
}

interface IScrollRef {
  virtualOffset: number;
  calculationList: any[];
  start: number;
  end: number;
  scrollOffset: number;
  scrollerHeight: number;
  contentHeight: number;
  isCurrentHandleButtom: boolean;
  dragging: boolean;
  sliderHeight: number;
  startPosY: number;
  startTop: number;
  positionHeight: Record<string, number>[];
  isMounted: boolean;
}

export default memo(function Scroll(props: IScrollProps) {
  //props/state
  const {
    list = [],
    estimateHeight = 30,
    cacheCount = 5,
    height: containerHeight = 500,
  } = props;
  // 获取视口元素
  // 获取滚动容器
  const $list = useRef<HTMLDivElement>(null);
  const $listWp = useRef<HTMLDivElement>(null);
  const $slider = useRef<HTMLDivElement>(null);
  const $scroll = useRef<HTMLDivElement>(null);
  const $container = useRef<HTMLDivElement>(null);
  const [renderListWithCache, setRenderListWithCache] = useState<any[]>([]);
  const [reRender, setReRender] = useState(false);
  //redux hooks

  //other hooks
  const { sumHeight, findIndexOverHeight, withinCache, updateRefState } =
    useScrollTool();
  const [scrollStateRef, setScrollState] = updateRefState<IScrollRef>({
    virtualOffset: 0,
    calculationList: [],
    start: 0,
    end: 0,
    scrollOffset: 0,
    scrollerHeight: 20,
    contentHeight: 0,
    isCurrentHandleButtom: false,
    dragging: false,
    sliderHeight: 20,
    startPosY: 0,
    startTop: 0,
    positionHeight: [],
    isMounted: false,
  });

  const render = useCallback(() => {
    const { virtualOffset, calculationList, start, end } = scrollStateRef;
    // 计算出视口要渲染的元素起始的索引
    const headIndex = findIndexOverHeight(calculationList, virtualOffset);

    const tailIndex = findIndexOverHeight(
      calculationList,
      virtualOffset + containerHeight,
    );
    // 视图里第一个元素部分展示的偏移量
    let renderOffset;
    // 判断当前滚动距离是否在缓存内
    if (withinCache(headIndex, tailIndex, start, end)) {
      // 只改变translateY
      const headIndexWithCache = start;
      renderOffset =
        virtualOffset - sumHeight(calculationList, 0, headIndexWithCache);
      $listWp.current &&
        ($listWp.current.style.transform = `translateY(-${renderOffset}px)`);
      console.log('渲染前', renderOffset);
      return;
    }
    // 不在缓存就更新元素
    setScrollState({
      isMounted: true,
    });

    // 添加缓存元素
    const headIndexWithCache = Math.max(headIndex - cacheCount, 0);
    const tailIndexWithCache = Math.min(
      tailIndex + cacheCount,
      calculationList.length,
    );
    renderOffset =
      virtualOffset - sumHeight(calculationList, 0, headIndexWithCache);

    console.log(
      '渲染后',
      renderOffset,
      virtualOffset,
      calculationList.slice(headIndexWithCache, tailIndexWithCache),
      calculationList.slice(headIndexWithCache, tailIndexWithCache)[0]?.height,
    );
    if ($listWp.current) {
      $listWp.current.style.transform = `translateY(-${renderOffset}px)`;
    }

    setScrollState({
      start: headIndexWithCache,
      end: tailIndexWithCache,
    });
    console.log(
      '我在保存',
      calculationList.slice(headIndexWithCache, tailIndexWithCache),
    );
    setRenderListWithCache(
      calculationList.slice(headIndexWithCache, tailIndexWithCache),
    );
  }, []);

  // 计算滑块高度
  const initScroller = useCallback(() => {
    const slider = $slider.current;
    if (!slider) return;
    // 获取内容物高度
    const { contentHeight } = scrollStateRef;
    // 滑块高度为视口高度和总体内容物高度之比 最小为20px
    const sliderHeight = Math.max(
      (containerHeight / contentHeight) * containerHeight,
      20,
    );
    slider.style.height = sliderHeight + 'px';
    // 保存滑块的高度
    setScrollState({
      sliderHeight,
    });
  }, []);

  const updateScroll = useCallback(() => {
    const slider = $slider.current;
    if (!slider) return;
    const { sliderHeight, virtualOffset, contentHeight } = scrollStateRef;
    console.log('sliderHeight', sliderHeight);
    // 滑块滚动的最大高度
    const maxScrollOffset = containerHeight - sliderHeight;
    // 随着拖拽更新滑块的位置
    let scrollOffset;
    scrollOffset = Math.max(
      (virtualOffset / (contentHeight - containerHeight)) *
        (containerHeight - sliderHeight),
      0,
    );
    scrollOffset = Math.min(scrollOffset, maxScrollOffset);
    slider.style.transform = `translateY(${scrollOffset}px)`;
    // 保存滑块的位置偏移量
    setScrollState({
      scrollOffset,
    });
  }, []);
  // item挂载好后重新计算高度
  useEffect(() => {
    updateHeight(renderListWithCache);
    initScroller();
  }, [renderListWithCache]);
  // 处理下原数据
  useEffect(() => {
    const newList = list.map((item, index) => ({
      height: estimateHeight,
      customHeight: item.customHeight,
      index,
      content: item.content,
      contentHeight: 0,
      ...item,
    }));
    setScrollState({
      calculationList: newList,
      contentHeight: newList.length * estimateHeight,
    });
    render();
  }, [list]);

  //滚动滑轮事件
  /**
   * 这里当数据量过于庞大时，100w左右，如果一瞬间将滚动条拉到底会出现滑动不到最后一个数据情况
   */
  const mouseWheelHandleFn = useCallback(
    throttle((e: WheelEvent) => {
      e.preventDefault();
      const { calculationList, virtualOffset, contentHeight } = scrollStateRef;
      console.log('滚动', contentHeight, calculationList);
      if (calculationList.length === 0) return;
      const scrollSpace = contentHeight - containerHeight;
      let y = virtualOffset || 0;
      y += e.deltaY / 3;
      // 限制滚动范围
      y = Math.max(y, 0);
      y = Math.min(y, scrollSpace);
      setScrollState({
        virtualOffset: y,
      });
      // 刷新滚动
      render();
      updateScroll();
      checkScrollEnd();
    }),

    [],
  );

  async function checkScrollEnd() {
    function generationList(count: number): Promise<unknown[]> {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          const list = new Array(count).fill(0).map((item, index) => ({
            index,
            customHeight: Math.ceil(Math.random() * 100 + 300),
          }));
          resolve(list);
        }, 100);
      });
    }
    // const {
    //   contentHeight,
    //   virtualOffset,
    //   isCurrentHandleButtom,
    //   calculationList,
    //   scrollOffset,
    //   sliderHeight,
    // } = scrollState.current;
    const {
      contentHeight,
      virtualOffset,
      isCurrentHandleButtom,
      calculationList,
      scrollOffset,
      sliderHeight,
    } = scrollStateRef;
    if (containerHeight <= scrollOffset + sliderHeight) {
      console.log('低了');
      return;
    }
    if (
      contentHeight - virtualOffset - 200 <= containerHeight &&
      !isCurrentHandleButtom
    ) {
      //scrollState.current.isCurrentHandleButtom = true;
      setScrollState({
        isCurrentHandleButtom: true,
      });
      const list = await generationList(10);
      if (list.length === 0) {
        return;
      }
      const length = calculationList.length;

      const _list = list.map((item: any, i) => ({
        height: estimateHeight,
        h: item?.customHeight,
        index: i + length,
        item: item,
      }));
      const newList = calculationList.concat(_list);
      const newHeight = _list.reduce((prev, cur) => prev + estimateHeight, 0);

      setScrollState({
        calculationList: newList,
        contentHeight: contentHeight + newHeight,
      });
      // scrollState.current.calculationList.push(
      //   ...list.map((item, i) => ({
      //     height: estimateHeight,
      //     customHeight: item.customHeight,
      //     index: i + length,
      //     item: item,
      //   }))
      // );
      // scrollState.current.contentHeight = sumHeight(
      //   scrollState.current.calculationList
      // );
    } else if (contentHeight - virtualOffset - 0 > containerHeight) {
      setScrollState({
        isCurrentHandleButtom: false,
      });
      //scrollState.current.isCurrentHandleButtom = false;
    }
  }

  useEffect(() => {
    $list.current?.addEventListener('wheel', mouseWheelHandleFn);
    $slider.current?.addEventListener('mousedown', saveScrolloffsetPos);
    $container.current?.addEventListener('mouseleave', cancelDragging);
    $container.current?.addEventListener('mouseup', cancelDragging);
    $slider.current?.addEventListener('click', stopPropagationFn);
    // $scroll.current?.addEventListener("click", (e) => {
    //   let clickScrollOffsetY = e.clientY;
    //   const { scrollOffset, virtualOffset, contentHeight, sliderHeight } =
    //     scrollStateRef;
    //   if (scrollOffset > clickScrollOffsetY) {
    //     // 向上滚
    //     // 小于3%直接抵顶
    //     if (clickScrollOffsetY < containerHeight * 0.03) clickScrollOffsetY = 0;
    //     setScrollState({
    //       virtualOffset: Math.max(
    //         (clickScrollOffsetY / containerHeight) * contentHeight,
    //         0
    //       ),
    //     });
    //   } else if (scrollOffset + sliderHeight < clickScrollOffsetY) {
    //     // 向下滚
    //     setScrollState({
    //       virtualOffset: Math.min(
    //         (clickScrollOffsetY / containerHeight) * contentHeight,
    //         contentHeight - containerHeight
    //       ),
    //     });
    //   }
    //   render();
    //   updateScroll();
    // });
    $container.current?.addEventListener('mousemove', mouseMoveHandleFn);
    return () => {
      $list.current?.removeEventListener('wheel', mouseWheelHandleFn);
      $slider.current?.removeEventListener('mousedown', saveScrolloffsetPos);
      $container.current?.removeEventListener('mouseup', cancelDragging);
      $container.current?.removeEventListener('mouseleave', cancelDragging);
      $slider.current?.removeEventListener('click', stopPropagationFn);
      $container.current?.removeEventListener('mousemove', mouseMoveHandleFn);
    };
  }, []);

  // 记录滑动距离
  const saveScrolloffsetPos = useCallback((e: MouseEvent) => {
    const { scrollOffset } = scrollStateRef;
    // 设置为正在拖拽
    setScrollState({
      dragging: true,
      startPosY: e.clientY,
      startTop: scrollOffset,
    });
  }, []);

  const cancelDragging = useCallback((e: MouseEvent) => {
    setScrollState({
      dragging: false,
    });
  }, []);
  const stopPropagationFn = useCallback((e: MouseEvent) => {
    e.stopPropagation();
  }, []);

  const mouseMoveHandleFn = useCallback(
    throttle((e: MouseEvent) => {
      const {
        sliderHeight,
        virtualOffset,
        contentHeight,
        dragging,
        startPosY,
        startTop,
      } = scrollStateRef;
      if (dragging) {
        // 滑动的坐标
        const curPosY = e.clientY;
        // 滑块当前的位置
        const scrollOffsetY = startTop + curPosY - startPosY;
        let offset;
        offset = Math.max(
          (scrollOffsetY / (containerHeight - sliderHeight)) * contentHeight,
          0,
        );
        offset = Math.min(offset, contentHeight - containerHeight);
        // 没有变化就退出
        if (virtualOffset === offset) return;
        // 保存偏移量
        setScrollState({
          virtualOffset: offset,
        });
        console.log('move');
        // 渲染视口元素
        render();
        // 更新滑块位置
        updateScroll();
      }
    }),
    [],
  );

  // 动态更新offset
  const updateHeight = useCallback((list: any[]) => {
    // 监听滚动容器的高度是否变化
    // 计算差值
    const listWp = $listWp.current;
    if (!listWp) return;
    const children = listWp.children;
    if (children && children.length) {
      const { calculationList, start, virtualOffset, contentHeight } =
        scrollStateRef;
      const oldCacheHeight = sumHeight(
        calculationList,
        start,
        start + cacheCount + 1,
      );
      // const oldPositionHeight = sumHeight(calculationList, start, start + list.length);
      const oldPositionHeight = list.reduce(
        (prev: number, cur: any) => prev + cur.height,
        0,
      );
      console.log('oldPositionHeight', oldPositionHeight);
      list.forEach((item: any, index: number) => {
        // 获取item渲染后的高度
        const newItemHeight = children[index].getClientRects()[0].height;
        item.height = newItemHeight;
        calculationList[index + start].height = newItemHeight;
      });
      const newPositionHeight = list.reduce(
        (prev: number, cur: any) => prev + cur.height,
        0,
      );
      // const newPositionHeight = sumHeight(calculationList, start, start + list.length);
      console.log('newPositionHeight', newPositionHeight);
      let roffset = 0;
      console.log('ca', calculationList.length, start + cacheCount);
      if (virtualOffset !== 0 && calculationList.length > start + cacheCount) {
        // console.log(
        //   "差值",
        //   start,
        //   sumHeight(calculationList, start, start + cacheCount + 1) -
        //     oldCacheHeight
        // );
        roffset =
          sumHeight(calculationList, start, start + cacheCount + 1) -
          oldCacheHeight;
        $listWp.current.style.transform = `translateY(-${
          virtualOffset - sumHeight(calculationList, 0, start) + roffset
        }px)`;
      }
      setScrollState({
        contentHeight: contentHeight + newPositionHeight - oldPositionHeight,
        virtualOffset: virtualOffset + roffset,
        isMounted: false,
      });
      console.log('渲染后2', scrollStateRef.contentHeight);
    }
  }, []);
  return (
    <>
      <div>总高度：{scrollStateRef.contentHeight}</div>
      <div>开始：{scrollStateRef.start}</div>
      <div>结束{scrollStateRef.end - 1}</div>
      <div>总高度：{scrollStateRef.contentHeight}</div>
      <div>偏移：{scrollStateRef.virtualOffset}</div>
      <div className="container" ref={$container}>
        <div className="list" ref={$list}>
          <div className="list-wrap" ref={$listWp}>
            {renderListWithCache.map((item) => {
              return (
                <div
                  id={item.index}
                  className="item"
                  key={item.index}
                  style={{ height: item.h + 'px' }}
                >
                  {item.index}--{item.content}
                </div>
              );
            })}
          </div>
        </div>
        <div className="scroll" ref={$scroll}>
          <div className="slider" ref={$slider}></div>
        </div>
      </div>
    </>
  );
});
