import { useRef, useCallback, useEffect, useReducer } from 'react';

import DownloadItem from '@/components/DownloadItem';

import styles from './download.module.less';
/**
 * 完成功能
 * 1. 分片下载
 * 2. 文件校验
 * 3. 断点续传
 * 4. 并行控制
 * 5. 使用indexDB记录下载内容，下次进入浏览器也能继续下载
 */
// 较长的等待时间：大文件需要较长的时间来传输到客户端，用户需要等待很长时间才能开始使用文件。
// 网络阻塞：由于下载过程中占用了网络带宽，其他用户可能会遇到下载速度慢的问题。
// 断点续传困难：如果下载过程中出现网络故障或者用户中断下载，需要重新下载整个文件，无法继续之前的下载进度。

// 任务状态类型
type TaskStatus = 'WAIT' | 'ING' | 'FAIL' | 'SUCCESS' | 'PAUSE';

export interface IDownloadTask {
  file: string;
  hash: string;
  size: number;
  status: TaskStatus;
}

type Action = {
  type: 'UPDATE_STATUS' | 'ADD_TASK';
  payload: IDownloadTask | Partial<IDownloadTask>;
};

// Reducer处理函数
function downloadReducer(
  state: IDownloadTask[],
  action: Action,
): IDownloadTask[] {
  const { type, payload } = action;
  switch (type) {
    case 'ADD_TASK':
      if (state.findIndex((item) => item.hash === payload.hash) !== -1) {
        return state;
      } else {
        return [...state, { ...(payload as IDownloadTask), status: 'WAIT' }];
      }
    case 'UPDATE_STATUS':
      return state.map((task) =>
        task.hash === payload.hash ? { ...task, status: payload.status } : task,
      ) as IDownloadTask[];
    default:
      return state;
  }
}

export default function download() {
  const [tasks, dispatch] = useReducer(downloadReducer, []);
  const fileHash = useRef<any>('');
  const files = [
    // '11268.jpg',
    // 'my-Store.zip',
    // '一键导入图片压缩包 (2).zip',
    // '000009-a-1.zip',
    // 'OIP-C.jpg',
    // 'UDP_Client.zip',
    // 'someDEV.zip',
    // 'Bob.zip',
    'run.zip',
  ];

  useEffect(() => {
    // 添加到下载列表后自动开启下载
    // 获取当前列表中没有在下载的
    const downLoadingTasks = tasks.filter((item) => item.status === 'ING');
    if (downLoadingTasks.length < 3) {
      const waitTask = tasks.find((item) => item.status === 'WAIT');
      waitTask && handleStatusChange(waitTask, 'ING');
    }
  }, [tasks]);

  const handleStatusChange = useCallback(
    (payload: Partial<IDownloadTask>, status: TaskStatus) => {
      dispatch({ type: 'UPDATE_STATUS', payload: { ...payload, status } });
    },
    [],
  );

  // 存储每一个分片的大小以及下载进度
  const handleDown = async (path: string) => {
    try {
      const headers = await fetchFileSize(path);
      const size = headers?.get('content-length');
      const hash = headers?.get('file-hash');
      fileHash.current = hash;
      if (!size || !hash) return alert('下载失败');

      // 推入下载列表
      const downloadItem: Omit<IDownloadTask, 'status'> = {
        file: path,
        size: +size,
        hash,
      };
      dispatch({ type: 'ADD_TASK', payload: downloadItem });
    } catch (error) {
      console.error('error', error);
    }
  };

  async function fetchFileSize(path: string) {
    const size = await fetch(`/api/file/size?fileId=${path}`, {
      method: 'head',
    }).then((res) => {
      if (res.ok) {
        return res.headers;
      }
    });
    return size;
  }

  const handleError = (e: unknown, payload: Partial<IDownloadTask>) => {
    console.log(e);
    handleStatusChange(payload, 'FAIL');
  };

  return (
    <>
      <div>download</div>
      <div>文件列表</div>
      <ul>
        {files.map((item, index) => {
          return (
            <li key={index} className={styles['download-list']}>
              {item}-<span onClick={() => handleDown(item)}>下载</span>
            </li>
          );
        })}
      </ul>

      <h2>当前正在下载</h2>
      <ul>
        {tasks.map((item, index) => {
          return (
            <li
              key={index}
              style={{
                display: 'flex',
                flexDirection: 'row',
                color: '#333',
                cursor: 'pointer',
              }}
            >
              <DownloadItem
                {...item}
                onStart={(e) => handleStatusChange(e, 'ING')}
                onStop={(e) => handleStatusChange(e, 'PAUSE')}
                onSuccess={(e) => handleStatusChange(e, 'SUCCESS')}
                onError={handleError}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}
