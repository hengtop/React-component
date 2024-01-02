const Koa = require('koa');
const Router = require('@koa/router');
const fs = require('fs');
const path = require('path');
const multer = require('@koa/multer');
const upload = multer();

const { bodyParser } = require('@koa/bodyparser');
const {
  getFileHash,
  getRange,
  pipeStream,
  mergeChunk,
} = require('./utils/index');

const app = new Koa();
const router = new Router();

// 路由设置

// 返回要下载的文件大小
router.head('/file/size', async (ctx, next) => {
  const { fileId } = ctx.query;
  const filePath = path.join(__dirname, './source', fileId);
  const fileInfo = fs.statSync(filePath);

  const fileHash = await getFileHash(filePath);
  // 设置哈希
  ctx.set('File-Hash', fileHash);
  ctx.set('Content-Length', fileInfo.size);
  ctx.status = 200;
});

// 下载文件
router.get('/file/download', async (ctx, next) => {
  const { fileId } = ctx.query;
  const filePath = path.join(__dirname, './source', fileId);

  const { size } = fs.statSync(filePath);

  const range = ctx.headers.range;

  if (!range) {
    // 告诉客户端 服务端事支持range请求的
    ctx.set('Accept-Range', 'bytes');
    // 算了还是给你返回吧--流式返回整体  这里可以判断 如果文件大小小的话可以直接返回了否则就必须设置分片
    ctx.body = fs.createReadStream(filePath);
    return;
  }

  const [start, end] = getRange(range);

  // 表示超出范围
  if (start > size || end > size) {
    ctx.status = 416;
    ctx.body = '';
    return;
  }
  ctx.set('Accept-Ranges', 'bytes');
  ctx.set('Content-Length', end - start + 1); // 注意这里的长度一定要匹配上，如果错误的设置过长的长度，会导致请求一直挂起
  ctx.set('Content-Range', `bytes ${start}-${end}/${size}`);
  ctx.status = 206;
  ctx.body = fs.createReadStream(filePath, { start, end });
});

// 校验接口
/**
 * 整合两个功能
 * 1. 校验文件是否已经存在
 * 2. 校验当前文件是否存在已经上传的分片
 */
router.post('/file/upload/verify', async (ctx, next) => {
  const { fileHash, name } = ctx.request.body;
  const uploadedChunks = await hasUploadChunk(fileHash);
  if (uploadedChunks?.length > 0) {
    ctx.body = {
      uploadedChunks,
      msg: '存在部分',
      code: 200,
    };
    return;
  }
  if (fs.existsSync(path.join(__dirname, './source', name))) {
    // 计算hash
    const hash = await getFileHash(path.join(__dirname, './source', name));
    console.log('校验', hash, fileHash);
    if (hash === fileHash) {
      ctx.body = {
        msg: '校验成功-快速上传成功',
        code: 201,
      };
      return;
    }
  }
  ctx.body = {
    msg: '新文件',
    code: 200,
  };
});

async function hasUploadChunk(fileHash) {
  // hash 文件夹下是否有分片
  const filePath = path.join(__dirname, './source', fileHash);
  // 如果有 则返回true 否则返回false
  if (fs.existsSync(filePath)) {
    const chunkPaths = await fs.readdirSync(filePath);
    // 返回已经下载的分片的名称
    return chunkPaths;
  }
}

router.post('/file/upload', upload.single('fileChunk'), async (ctx, next) => {
  // 创建文件夹
  const filePath = path.join(
    __dirname,
    './source',
    ctx.request.body.chunkId.split('-')[0],
  );
  if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
  // 创建文件
  const fileName = path.join(filePath, ctx.request.body.chunkId);
  fs.writeFileSync(fileName, ctx.file.buffer);
  ctx.body = '上传成功';
});

// 注意这里合并文件可能会导致文件损坏具体原因不明
router.post('/file/merge', async (ctx, next) => {
  const { fileHash, type, name, chunkSize } = ctx.request.body;
  const filePath = path.join(__dirname, './source', fileHash);
  const outputPath = path.join(__dirname, './source', name);

  // 这里并发合并分片会导致合并后的文件异常,大概找到原因了，每一批并发操作的流都会覆盖上一批的文件,这个可能和node异步处理有关
  // 所以改为串行合并文件
  await mergeChunk(filePath, outputPath);

  // 删除临时文件;
  fs.rm(filePath, { recursive: true }, (err) => {
    if (!err) {
      console.log('删除临时文件成功～');
    }
  });

  // 读取hash进行二次校验
  const mergeHash = await getFileHash(path.join(__dirname, './source', name));
  if (mergeHash === fileHash) {
    console.log('合并成功');
    ctx.body = {
      msg: '合并成功',
    };
  } else {
    console.log('合并失败');
    ctx.body = {
      msg: '合并失败',
    };
  }
});

// use 中间件
app.use(bodyParser()).use(router.routes()).use(router.allowedMethods());

app.listen('3001', () => {
  console.log('3001 启动！');
});
