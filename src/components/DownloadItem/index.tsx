import React, { useEffect, useRef, useState, useCallback } from 'react';

import { getHexArray, storeHexArray } from '@/pages/upload_download/indexDB';

import type { IDownloadTask } from '@/pages/upload_download/download';
import type { IChunk } from '@/pages/upload_download/indexDB';

interface IProps extends IDownloadTask {
  onStop: (e: { hash: string }) => void;
  onStart: (e: { hash: string }) => void;
  onSuccess: (e: { hash: string }) => void;
  onError: (err: unknown, e: { hash: string }) => void;
}

const UNIT = 1024 * 1024 * 5;

export default function DownloadItem(props: IProps) {
  let controller = new AbortController();
  let signal = controller.signal;
  const { file, hash, size, status, onError, onStart, onSuccess, onStop } =
    props;
  const progressRef = useRef();
  const [progress, setProgress] = useState('0');
  const sizeQueue = useRef<IChunk[]>([]);
  useEffect(() => {
    if (status === 'ING') {
      initDownload();
    }
    return () => {
      controller && controller.abort();
    };
  }, [status]);

  const initDownload = async () => {
    try {
      controller = new AbortController();
      signal = controller.signal;
      const { hexArray } = await getHexArray(hash);
      sizeQueue.current = (hexArray as IChunk[]) ?? getFileSlice(+size);
      // 设置分片的请求
      const promiseQueue = sizeQueue.current
        .filter((item) => !item.success)
        .map((item) => {
          const { offset, end, start, index } = item;
          return () => fetchFileBlob(hash, file, offset + start, end, index);
        });
      // 并发下载，最多6条
      const dispatch = createTaskDispatch(1);
      const callback = async () => {
        const c = sizeQueue.current.map((item) => item.value);
        const blob = new Blob(c, {
          type: '.' + file.split('.')[1],
        });
        // 校验文件是否完整
        const downloadHash = await getDownLoadFileHash(
          await blob.arrayBuffer(),
        );
        if (downloadHash !== hash) {
          throw new Error('文件损坏，请重新下载');
        }
        console.log('文件校验成功');
        const href = URL.createObjectURL(blob);
        // 下载
        const a = document.createElement('a');
        a.download = file.split('/').pop() as string;
        a.href = href;
        a.click();
        URL.revokeObjectURL(href);
        onSuccess({ hash });

        storeHexArray({ hash });
      };
      // 等待并发获取文件
      await dispatch(...promiseQueue);
      callback();
    } catch (error) {
      if (!signal.aborted) {
        onError(error, { hash });
      }
    }
  };

  function getFileSlice(length: number) {
    const num = Math.ceil(length / UNIT);
    const res = Array.from({ length: num }).map((_, index) => {
      const end = (index + 1) * UNIT - 1;
      return {
        index,
        value: null,
        start: index * UNIT,
        end: Math.min(end, length - 1),
        sliceLength: Math.min(end, length - 1) - index * UNIT + 1,
        success: false,
        loaded: 0,
        offset: 0,
      };
    });
    return res;
  }

  async function fetchFileBlob(
    hash: string,
    path: string,
    start: number,
    end: number,
    index: number,
  ) {
    return (
      fetch(`/api/file/download?fileId=${path}`, {
        method: 'get',
        headers: {
          range: `bytes=${start}-${end}`,
          accept: 'application/octet-stream',
        },
        signal,
      })
        // 小文件或者直接转换为blob
        //.then(res => res.blob())
        .then((res) => {
          // 创建可读流的reader
          if (res.body) {
            const reader = res.body.getReader();
            // 文件的总长度
            const totalLength = Number(
              res.headers.get('content-range')?.split('/')[1],
            );
            return new Promise((resolve, reject) => {
              new ReadableStream({
                async start(controller) {
                  try {
                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                      const { done, value } = await reader.read();
                      // 更新进度
                      if (value) {
                        // 保存下载的部分切片
                        if (!sizeQueue.current[index].value) {
                          sizeQueue.current[index].value = new Uint8Array(
                            sizeQueue.current[index].sliceLength,
                          );
                          sizeQueue.current[index].value.set(
                            value,
                            sizeQueue.current[index].offset,
                          );
                        } else {
                          sizeQueue.current[index].value.set(
                            value,
                            sizeQueue.current[index].offset,
                          );
                        }
                        // 分块的下载量
                        sizeQueue.current[index].offset += value.length;
                        // 分块下载进度，相对于总长度
                        sizeQueue.current[index].loaded =
                          sizeQueue.current[index].offset / totalLength;
                      }
                      if (done) {
                        sizeQueue.current[index].success = true;
                        sizeQueue.current[index].offset =
                          sizeQueue.current[index].sliceLength;
                        await storeHexArray({
                          hash,
                          hexArray: sizeQueue.current,
                          timestamp: Date.now(),
                        });
                        resolve(sizeQueue.current);
                        break;
                      } else {
                        controller.enqueue(value);
                      }
                      completeLoading(sizeQueue.current);
                    }
                  } catch (err) {
                    await storeHexArray({
                      hash,
                      hexArray: sizeQueue.current,
                      timestamp: Date.now(),
                    });
                    reject(err);
                  } finally {
                    controller.close();
                    reader.releaseLock();
                  }
                },
              });
            });
          }
        })
    );
  }

  /**
   * 因为下载停止后是会按照分片的
   */
  const completeLoading: (...args: any[]) => void = useCallback(
    throttleAndExecute(
      (loadingQueue: number[]) => {
        const loadingRange = Math.min(
          loadingQueue.reduce((prev: any, cur: any) => {
            return prev + cur.loaded;
          }, 0) * 100,
          100,
        ).toFixed(2);
        setProgress(loadingRange);
      },
      50,
      true,
    ),
    [],
  );

  // 进度条更新频率节流
  function throttleAndExecute(
    func: (...arg: any[]) => void,
    delay: number,
    executeImmediately: boolean,
  ) {
    return function (...arg: []) {
      // 参数总是能拿到最新的
      const args = arg;

      if (executeImmediately && !progressRef.current) {
        // eslint-disable-next-line prefer-spread
        func.apply(null, args);
      }
      if (!progressRef.current) {
        progressRef.current = setTimeout(function () {
          // eslint-disable-next-line prefer-spread
          func.apply(null, args);
          progressRef.current = null;
        }, delay);
      }
    };
  }

  const handleStop = () => {
    // 暂停后需重新设置signal
    controller.abort();
    onStop({ hash });
  };

  const handleStart = async () => {
    onStart({ hash });
  };

  async function getDownLoadFileHash(buffer: BufferSource) {
    const messageDigest = await crypto.subtle.digest('SHA-256', buffer);
    const hashStr = Array.from(new Uint8Array(messageDigest))
      .map((item) => item.toString(16).padStart(2, '0'))
      .join('');
    return hashStr;
  }

  function createTaskDispatch<T = unknown>(max = 5) {
    const untouchedTasks: ((() => Promise<T>) | Promise<T>)[] = [];
    // 当前并发最大容量
    const size = max;
    const drainUntouchedTasks = (
      resolve: (value: unknown) => void,
      reject: (value: unknown) => void,
    ) => {
      // 暂定不算错误
      while (max > 0 && untouchedTasks.length > 0) {
        let task = untouchedTasks.shift();
        task = typeof task === 'function' ? task() : task;
        max--;
        console.log('占一个位置。剩余:', max);
        task?.catch(reject).finally(() => {
          max++;
          console.log('释放一个位置。剩余:', max);
          drainUntouchedTasks(resolve, reject);
        });
      }
      if (untouchedTasks.length <= 0 && max === size) {
        resolve(true);
      }
    };

    return function dispatch(...task: ((() => Promise<T>) | Promise<T>)[]) {
      untouchedTasks.push(...task);
      return new Promise((resolve, reject) => {
        drainUntouchedTasks(resolve, reject);
      });
    };
  }

  return (
    <div>
      {file}---下载进度：{progress}%--状态：{status}
      {status === 'ING' && <button onClick={handleStop}>暂停</button>}
      {status === 'PAUSE' && (
        <button onClick={() => handleStart()}>开始</button>
      )}
      {status === 'FAIL' && <button onClick={() => handleStart()}>重试</button>}
    </div>
  );
}
