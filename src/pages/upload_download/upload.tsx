/*
 * @Date: 2022-03-09 14:52:57
 * @LastEditors: zhangheng
 * @LastEditTime: 2024-01-02 21:30:27
 */

/**
 * 文件上传
 *
 * 1. 计算文件hash
 * 2. 向服务端发送文件校验，如果有hash，则直接上传成功
 * 3. 分片上传
 * 4. 并发控制
 * 5. 分片上传完毕后合并分片
 * 6. 上传的进度暂停重试暂时只做分片粒度，比如一个分片在上传的时候暂停了，下一次重试会重新下载该分片
 */
import React, { memo, useState, useRef, useCallback } from 'react';

const CHUNK_SIZE = 5;

let controller = new AbortController();
let signal = controller.signal;
const progressArr = [];
let file;

export default memo(function index() {
  //props/state
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<any>(null);
  //redux hooks

  //other hooks

  //其他逻辑
  const handleUpload = (event) => {
    file = event.target.files[0];
    readFile(event.target.files[0]);
  };

  function readFile(file: File) {
    return new Promise((resolve) => {
      const read = new FileReader();
      read.onload = async function (e) {
        const fileHash = await getDownLoadFileHash(e.target?.result);
        // 校验
        const {
          code,
          msg,
          uploadedChunks = [],
        } = await verifyFile({ fileHash, name: file.name });
        if (code === 201) {
          alert(msg);
          return;
        }

        const dispatch = createTaskDispatch<string | undefined>(
          6,
          async () => {
            handleMergeFile({
              fileHash,
              type: file.type.split('/')[1],
              name: file.name,
              chunkSize: CHUNK_SIZE,
            });
          },
          {
            signal, // 是否需要中断
          },
        );
        let uploadChunkArr = [];
        uploadChunkArr = sliceFile(file, CHUNK_SIZE)
          .filter((item) => {
            return !uploadedChunks.includes(fileHash + '-' + item.index);
          })
          .map((item) => {
            return () =>
              uploadChunk({
                chunk: item.fileSlice,
                index: item.index,
                fileHash,
                type: file.type,
                totalSize: item.totalSize,
              });
          });
        // 注意这里如果分片过多会爆栈的
        dispatch(...uploadChunkArr);
      };
      read.readAsArrayBuffer(file);
    });
  }
  async function uploadChunk({ chunk, fileHash, index, type, totalSize }) {
    const fd = new FormData();
    fd.append('chunkId', fileHash + '-' + index);
    fd.append('fileType', type);
    fd.append('fileChunk', chunk);
    const res = await xhrRequest('/api/file/upload', {
      signal,
      method: 'POST',
      body: fd,
      uploadProgress: (e) => {
        progressArr[index] = {
          loaded: e.loaded / totalSize,
        };
        completeLoading(progressArr);
      },
    });
    return res;
  }

  function xhrRequest(
    url: string,
    options: {
      signal?: AbortSignal;
      method?: string;
      body?: any;
      uploadProgress?: (ev: ProgressEvent<XMLHttpRequestEventTarget>) => any;
    },
  ) {
    const { method = 'GET', body, uploadProgress } = options;
    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.addEventListener('readystatechange', () => {
        if (xhr.DONE === xhr.readyState) {
          // 请求完成
          resolve(xhr.responseText);
        }
      });
      uploadProgress &&
        xhr.upload.addEventListener('progress', (e) => {
          uploadProgress(e);
          if (signal.aborted) {
            xhr.abort();
          }
        });
      xhr.open(method, url);
      // 注意这里不要自行设置content-type请求头,否者会覆盖掉 boundary 导致服务端报错 nodejs.Error: Multipart: Boundary not found
      // xhr.setRequestHeader("content-Type", "mutipart/form-data");
      xhr.send(body);
    });
  }

  const completeLoading: (...args: any[]) => void = useCallback(
    throttleAndExecute(
      (loadingQueue: number[]) => {
        const totalPercentage =
          loadingQueue.reduce((prev: any, cur: any) => {
            return prev + cur.loaded;
          }, 0) * 100;
        const loadingRange = Math.min(Math.ceil(totalPercentage), 100);
        setProgress(Math.max(loadingRange, progress));
      },
      100,
      true,
    ),
    [progress],
  );

  function formatPercentage(number: number) {
    return number.toFixed(2) + '%';
  }

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

  async function getDownLoadFileHash(buffer: BufferSource | ArrayBuffer) {
    const messageDigest = await crypto.subtle.digest('SHA-256', buffer);
    const hashStr = Array.from(new Uint8Array(messageDigest))
      .map((item) => item.toString(16).padStart(2, '0'))
      .join('');
    return hashStr;
  }

  // 文件切片
  function sliceFile(file: File, chunkSize: number) {
    const chunkList = [];
    let cur = 0;
    let index = 0;

    while (cur < file.size) {
      chunkList.push({
        fileSlice: file.slice(cur, cur + chunkSize),
        index,
        totalSize: file.size,
      });
      index++;
      cur += chunkSize;
    }
    return chunkList;
  }

  // 验证
  async function verifyFile({ fileHash, name }) {
    const params = {
      fileHash,
      name,
    };
    const res = await fetch('/api/file/upload/verify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(params),
    })
      .then((res) => {
        if (res.ok) return res;
      })
      .then((res) => res?.json());
    return res;
  }

  const handleMergeFile = async ({ fileHash, type, name, chunkSize }) => {
    const res = await fetch('/api/file/merge', {
      method: 'post',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fileHash,
        type,
        name,
        chunkSize,
      }),
    })
      .then((res) => res)
      .then((res) => res.json());
    console.log(res);
  };

  const handleStop = () => {
    controller.abort();
    console.log('stop', signal.aborted);
  };

  function createTaskDispatch<
    T = unknown,
  >(max = 5, callback: () => void, options = {}) {
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

  const handleStart = () => {
    controller = new AbortController();
    signal = controller.signal;
    readFile(file);
  };

  return (
    <div>
      <div>upload</div>
      <div>上传进度:{formatPercentage(progress)}</div>
      <input id="file" name="file" type="file" onChange={handleUpload} />
      {/* <button onClick={handleClick}>合并</button> */}
      <button onClick={handleStop}>停止</button>
      <button onClick={handleStart}>开始</button>
    </div>
  );
});
