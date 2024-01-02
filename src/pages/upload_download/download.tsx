import { useState, useRef, useCallback, Fragment } from 'react';
/**
 * 完成功能
 * 1. 分片下载
 * 2. 文件校验
 * 3. 断点续传
 * 4. 并行控制
 */
// 较长的等待时间：大文件需要较长的时间来传输到客户端，用户需要等待很长时间才能开始使用文件。
// 网络阻塞：由于下载过程中占用了网络带宽，其他用户可能会遇到下载速度慢的问题。
// 断点续传困难：如果下载过程中出现网络故障或者用户中断下载，需要重新下载整个文件，无法继续之前的下载进度。

// 分片大小为1mb
const UNIT = 1024 * 100;

let sizeQueue: any[] = [];
let controller = new AbortController();
let signal = controller.signal;
export default function download() {
  const [url, setUrl] = useState('');
  const [progress, setProgress] = useState('0%');
  const progressRef = useRef<any>(null);
  const fileHash = useRef<any>('');
  const files = ['1.sketch', '2.png', '3.txt', '4.zip'];
  // 存储每一个分片的大小以及下载进度
  const handleDown = async (path: string) => {
    try {
      const headers = await fetchFileSize(path);
      const size = headers?.get('content-length');
      const hash = headers?.get('file-hash');
      fileHash.current = hash;
      if (!size) return alert('下载失败');

      // 分片
      sizeQueue = getFileSlice(+size);
      // 设置分片的请求
      const promiseQueue = sizeQueue.map((item) => {
        const { start, end } = item;

        return () => fetchFileBlob(path, start, end, item.index);
      });
      const dispatch = createTaskDispatch<Blob | undefined>(
        6,
        async () => {
          console.log('执行');
          const c = sizeQueue.map((item) => item.value);
          const blob = new Blob(c, {
            type: '.' + path.split('.')[1],
          });
          // 校验文件是否完整
          const downloadHash = await getDownLoadFileHash(
            await blob.arrayBuffer(),
          );
          if (downloadHash !== fileHash.current) {
            throw Error('文件损坏，请重新下载');
          }
          console.log('文件校验成功');
          const href = URL.createObjectURL(blob);
          // 清除之前的
          setUrl(href);
          // sizeQueue.forEach(item => {
          //   item.value = null;
          // })
          // 下载
          const a = document.createElement('a');
          a.download = path.split('/').pop() as string;
          a.href = href;
          a.click();
          URL.revokeObjectURL(href);
        },
        {
          signal, // 是否需要中断
        },
      );
      dispatch(...promiseQueue);
      // Promise.all(promiseQueue).then(async (res) => {
      //   if (!res) return;
      //   console.log(sizeQueue);
      // });
    } catch (error) {
      console.error(error);
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
    path: string,
    start: number,
    end: number,
    index: number,
  ) {
    try {
      return await fetch(`/api/file/download?fileId=${path}`, {
        method: 'get',
        headers: {
          range: `bytes=${start}-${end}`,
          accept: 'application/octet-stream',
        },
        signal,
      })
        // 或者直接转换为blob
        //.then(res => res.blob())
        .then((res) => {
          // 创建可读流的reader
          if (res.body) {
            const reader = res.body.getReader();
            const totalLength = Number(
              res.headers.get('content-range')?.split('/')[1],
            );
            return new ReadableStream({
              async start(controller) {
                try {
                  // eslint-disable-next-line no-constant-condition
                  while (true) {
                    const { done, value } = await reader.read();
                    // 更新进度
                    if (value) {
                      // 保存下载的部分切片
                      if (!sizeQueue[index].value) {
                        sizeQueue[index].value = new Uint8Array(
                          sizeQueue[index].sliceLength,
                        );
                        sizeQueue[index].value.set(
                          value,
                          sizeQueue[index].offset,
                        );
                      } else {
                        sizeQueue[index].value.set(
                          value,
                          sizeQueue[index].offset,
                        );
                      }
                      //console.log(`总长度:${sizeQueue[index].value.length}-偏移量${sizeQueue[index].offset}-剩余量${sizeQueue[index].value.length-sizeQueue[index].offset}-添加量${value.length}`);

                      sizeQueue[index].offset += value.length;
                      sizeQueue[index].loaded =
                        sizeQueue[index].offset / totalLength;
                    }
                    if (done) {
                      sizeQueue[index].success = true;
                      sizeQueue[index].offset = sizeQueue[index].sliceLength;
                      break;
                    } else {
                      controller.enqueue(value);
                    }
                    completeLoading(sizeQueue);
                  }
                } catch (err) {
                  console.log('err', err);
                } finally {
                  controller.close();
                  reader.releaseLock();
                }
              },
            });
          }
        })
        .then((res) => {
          return new Response(res);
        })
        .then((newRes) => newRes.blob());
    } catch (err) {
      //console.log("🚀 ~ return newPromise ~ err:", err);
    }
  }

  async function fetchFileSize(path: string) {
    try {
      const size = await fetch(`/api/file/size?fileId=${path}`, {
        method: 'head',
      }).then((res) => {
        if (res.ok) {
          return res.headers;
        }
      });
      return size;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  const completeLoading: (...args: any[]) => void = useCallback(
    throttleAndExecute(
      (loadingQueue: number[]) => {
        const loadingRange =
          Math.min(
            Math.ceil(
              loadingQueue.reduce((prev: any, cur: any) => {
                return prev + cur.loaded;
              }, 0) * 100,
            ),
            100,
          ).toFixed(2) + '%';
        setProgress(loadingRange);
      },
      300,
      true,
    ),
    [],
  );

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
    console.log('stop', signal);
    controller.abort();
  };

  const handleStart = (path: string) => {
    controller = new AbortController();
    signal = controller.signal;
    // 拿到已经保存的数据，重新分片 并下载
    // 返回还没有完成的，重新下载
    const promiseQueue = sizeQueue
      .filter((item) => !item.success)
      .map((item) => {
        const { offset, end, start, index } = item;
        return () => fetchFileBlob(path, offset + start, end, index);
      });

    const dispatch = createTaskDispatch<Blob | any>(3, async () => {
      const c = sizeQueue.map((item) => item.value);
      const blob = new Blob(c, {
        type: '.' + path.split('.')[1],
      });
      // 校验文件是否完整
      const downloadHash = await getDownLoadFileHash(await blob.arrayBuffer());
      console.log(downloadHash, fileHash.current);
      if (downloadHash !== fileHash.current) {
        throw Error('文件损坏，请重新下载');
      }
      console.log('文件校验成功');
      const href = URL.createObjectURL(blob);
      // 清除之前的
      setUrl(href);
      // sizeQueue.forEach(item => {
      //   item.value = null;
      // })
      // 下载
      const a = document.createElement('a');
      a.download = path.split('/').pop() as string;
      a.href = href;
      a.click();
      URL.revokeObjectURL(href);
    });
    dispatch(...promiseQueue);

    // Promise.all(promiseQueue).then(async (res) => {
    //   if (!res) return;
    //   console.log(sizeQueue);
    //   const c = sizeQueue.map((item) => item.value);
    //   const blob = new Blob(c, {
    //     type: "." + path.split(".")[1],
    //   });
    //   try {
    //     const downloadHash = await getDownLoadFileHash(
    //       await blob.arrayBuffer()
    //     );
    //     if (downloadHash !== fileHash.current) {
    //       throw Error("文件损坏，请重新下载");
    //     }
    //     console.log("文件校验成功");
    //     const href = URL.createObjectURL(blob);
    //     // 清除之前的
    //     URL.revokeObjectURL(url);
    //     setUrl(href);
    //     // sizeQueue.forEach(item => {
    //     //   item.value = null;
    //     // })
    //     //下载
    //     const a = document.createElement("a");
    //     a.download = path.split("/").pop() as string;
    //     a.href = href;
    //     a.click();
    //     URL.revokeObjectURL(href);
    //   } catch (error) {
    //     console.log(error);
    //   }
    // });
  };

  async function getDownLoadFileHash(buffer: BufferSource) {
    const messageDigest = await crypto.subtle.digest('SHA-256', buffer);
    console.log('messageDigest', messageDigest);
    const hashStr = Array.from(new Uint8Array(messageDigest))
      .map((item) => item.toString(16).padStart(2, '0'))
      .join('');
    return hashStr;
  }

  function createTaskDispatch<T = unknown>(
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

  return (
    <>
      <div>download</div>
      <div>下载</div>
      <div>进度:{progress}</div>

      <ul>
        {files.map((item, index) => {
          return (
            <Fragment key={index}>
              <li
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  color: '#333',
                  cursor: 'pointer',
                }}
              >
                <div onClick={() => handleDown(item)}>点击下载{item}</div>
                <button onClick={handleStop}>暂停</button>
                <button onClick={() => handleStart(item)}>恢复</button>
              </li>
            </Fragment>
          );
        })}
      </ul>
      <img width={200} height={200} src={url} alt="" />
    </>
  );
}
