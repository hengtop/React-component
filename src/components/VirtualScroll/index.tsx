import type { Any } from '@/types';
import {
  memo,
  useState,
  useEffect,
  useCallback,
  useRef,
  Fragment,
  ReactElement,
} from 'react';
import { throttle } from '@/utils';
import { useScrollTool } from './hooks';

import './index.less';

export interface IScrollProps {
  list: unknown[];
  children: (props: Any, index: number) => ReactElement;
  itemKey?: string;
  estimateHeight?: number;
  cacheCount?: number;
  height?: number;
  scrollBottomHeight?: number;
  onScrollBottom?: (loadMore: (list: unknown[]) => void) => void;
}

export interface ICalculationList {
  domHeight: number;
  index: number;
  content: Any;
}

interface IScrollRef {
  virtualOffset: number;
  calculationList: ICalculationList[];
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
}

export default memo(function Scroll(props: IScrollProps) {
  //props/state
  const {
    list = [],
    estimateHeight = 30,
    cacheCount = 5,
    height: containerHeight = 500,
    itemKey,
    children,
    onScrollBottom,
    scrollBottomHeight = 50,
  } = props;

  // 滚动容器
  const $list = useRef<HTMLDivElement>(null);
  // 动态滚动的偏移容器
  const $listWp = useRef<HTMLDivElement>(null);
  // 滑块
  const $slider = useRef<HTMLDivElement>(null);
  // 滚动条
  const $scroll = useRef<HTMLDivElement>(null);
  // 滚动条整体容器
  const $container = useRef<HTMLDivElement>(null);
  const [renderListWithCache, setRenderListWithCache] = useState<
    ICalculationList[]
  >([]);
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
  });

  // 处理下原数据
  useEffect(() => {
    const newList = list.map((item, index) => ({
      domHeight: estimateHeight,
      index,
      content: item,
    }));
    // 初始化数据
    setScrollState({
      calculationList: newList,
      contentHeight: newList.length * estimateHeight,
    });
    // 初始化渲染
    render();
    updateSlider();
  }, [list]);

  // item挂载好后重新计算高度
  useEffect(() => {
    updateHeight(renderListWithCache);
    updateSlider();
  }, [renderListWithCache]);

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
      return;
    }

    // 添加缓存元素
    const headIndexWithCache = Math.max(headIndex - cacheCount, 0);
    const tailIndexWithCache = Math.min(
      tailIndex + cacheCount,
      calculationList.length,
    );
    renderOffset =
      virtualOffset - sumHeight(calculationList, 0, headIndexWithCache);

    if ($listWp.current) {
      $listWp.current.style.transform = `translateY(-${renderOffset}px)`;
    }

    setScrollState({
      start: headIndexWithCache,
      end: tailIndexWithCache,
    });
    setRenderListWithCache(
      calculationList.slice(headIndexWithCache, tailIndexWithCache),
    );
  }, []);

  // 计算滑块高度
  const updateSlider = useCallback(() => {
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

  //滚动滑轮事件
  /**
   * 这里当数据量过于庞大时，100w左右，如果一瞬间将滚动条拉到底会出现滑动不到最后一个数据情况
   */
  const mouseWheelHandleFn = useCallback(
    throttle((e: WheelEvent) => {
      e.preventDefault();
      const { calculationList, virtualOffset, contentHeight } = scrollStateRef;
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
      listenerScrollBottom();
    }),

    [],
  );

  const listenerScrollBottom = useCallback(() => {
    const { contentHeight, virtualOffset, isCurrentHandleButtom } =
      scrollStateRef;
    // 没有触发滚动到底，且离底部小于200
    if (
      contentHeight - virtualOffset - scrollBottomHeight <= containerHeight &&
      !isCurrentHandleButtom
    ) {
      setScrollState({
        isCurrentHandleButtom: true,
      });
      onScrollBottom?.(loadMore);
    } else if (
      contentHeight - virtualOffset - scrollBottomHeight >
      containerHeight
    ) {
      setScrollState({
        isCurrentHandleButtom: false,
      });
    }
  }, []);

  const loadMore = useCallback((list: unknown[]) => {
    const { contentHeight, calculationList } = scrollStateRef;
    if (list.length === 0) {
      return;
    }
    const length = calculationList.length;
    const _list = list.map((item: Any, index) => ({
      domHeight: estimateHeight,
      index: index + length,
      content: item,
    }));
    const newList = calculationList.concat(_list);
    const newHeight = _list.reduce((prev) => prev + estimateHeight, 0);

    setScrollState({
      calculationList: newList,
      contentHeight: contentHeight + newHeight,
    });
  }, []);

  useEffect(() => {
    $list.current?.addEventListener('wheel', mouseWheelHandleFn);
    $slider.current?.addEventListener('mousedown', saveScrolloffsetPos);
    $container.current?.addEventListener('mouseleave', cancelDragging);
    $container.current?.addEventListener('mouseup', cancelDragging);
    $slider.current?.addEventListener('click', stopPropagationFn);
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

  const cancelDragging = useCallback(() => {
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
        // 渲染视口元素
        render();
        // 更新滑块位置
        updateScroll();
        listenerScrollBottom();
      }
    }),
    [],
  );

  // 动态更新offset
  const updateHeight = useCallback((list: ICalculationList[]) => {
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
      const oldPositionHeight = list.reduce(
        (prev: number, cur: ICalculationList) => prev + cur.domHeight,
        0,
      );
      list.forEach((item: ICalculationList, index: number) => {
        // 获取item渲染后的高度
        const newItemHeight = children[index].getClientRects()[0].height;
        item.domHeight = newItemHeight;
        calculationList[index + start].domHeight = newItemHeight;
      });
      const newPositionHeight = list.reduce(
        (prev: number, cur: ICalculationList) => prev + cur.domHeight,
        0,
      );

      // 修复拉动滚动条过快导致的滚动跳动
      let roffset = 0;
      if (virtualOffset !== 0 && calculationList.length > start + cacheCount) {
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
      });
    }
  }, []);
  return (
    <>
      {/* <div>总高度：{scrollStateRef.contentHeight}</div>
      <div>开始：{scrollStateRef.start}</div>
      <div>结束{scrollStateRef.end - 1}</div>
      <div>总高度：{scrollStateRef.contentHeight}</div>
      <div>偏移：{scrollStateRef.virtualOffset}</div> */}
      <div className="container" ref={$container}>
        <div className="list" ref={$list}>
          <div className="list-wrap" ref={$listWp}>
            {renderListWithCache.map((item) => {
              return (
                item.content && (
                  <Fragment key={itemKey ? item.content[itemKey] : item.index}>
                    {children(item.content, item.index)}
                  </Fragment>
                )
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
