const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
/**
 *
 * @param {*} range Content-Range: bytes 0-102399/19905393
 * @returns [start, end]
 * @description 获取content-range的范围
 */
function getRange(range) {
  return range
    .slice(6)
    .split('-')
    .map((byte) => +byte);
}

/**
 *
 * @param {*} filePath 文件路径
 * @returns
 * @description 获取文件的hash值
 */
function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const hash = crypto.createHash('sha256');
    stream.on('readable', () => {
      const data = stream.read();
      if (data) hash.update(data);
      else {
        resolve(hash.digest('hex'));
      }
    });

    stream.on('error', () => {
      reject();
    });
  });
}

/**
 * 读写流管道
 * @param {*} path 读取文件路径
 * @param {*} writeStream 可写流
 * @returns promise
 */
function pipeStream(readStream, writeStream) {
  return new Promise((resolve, reject) => {
    readStream.pipe(writeStream, { end: false });
    readStream.on('end', () => {
      resolve(true);
    });
    readStream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 *
 * @param {*} chunksFilePath 分片目录
 * @param {*} outputPath 输出目录+文件名
 */
async function mergeChunk(chunksFilePath, outputPath) {
  // 获取分片目录
  const chunkListPaths = await fs.readdirSync(chunksFilePath);
  // 排序
  const pathsArr = chunkListPaths.sort((a, b) => {
    const x = +a.split('-')[1];
    const y = +b.split('-')[1];
    return x - y;
  });
  let chunkIndex = 0;
  // 创建可写流
  const writeableStream = fs.createWriteStream(outputPath);
  writeableStream.on('error', (err) => {
    writeableStream.close();
    throw new Error(err);
  });
  while (chunkIndex < pathsArr.length) {
    // 串行合并文件
    const chunkPath = path.join(chunksFilePath, pathsArr[chunkIndex]);
    // 创建当前分片的可读流
    const readableStream = fs.createReadStream(chunkPath);
    await pipeStream(readableStream, writeableStream);
    chunkIndex++;
  }
  writeableStream.end();
}

function createTaskDispatch(max = 5, callback, options = {}) {
  const untouchedTasks = [];
  const size = max;

  const drainUntouchedTasks = () => {
    if (options?.signal?.aborted) throw new Error('dispatch aborted');
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

  return function dispatch(...task) {
    untouchedTasks.push(...task);
    drainUntouchedTasks();
  };
}

module.exports = {
  getFileHash,
  getRange,
  pipeStream,
  createTaskDispatch,
  mergeChunk,
};
