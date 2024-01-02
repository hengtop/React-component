const fs = require('fs');
const path = require('path');
const { getFileHash } = require('./index');

// 读取文件进行哈希比较

async function checkChunk() {
  const path1 = fs.readdirSync(path.join(__dirname, '../source/fail'));
  const pathsArr1 = path1.sort((a, b) => {
    const x = +a.split('-')[1];
    const y = +b.split('-')[1];
    return x - y;
  });

  const path2 = fs.readdirSync(path.join(__dirname, '../source/success'));
  const pathsArr2 = path2.sort((a, b) => {
    const x = +a.split('-')[1];
    const y = +b.split('-')[1];
    return x - y;
  });

  const res1 = await Promise.all(
    pathsArr1.map((item) => {
      return getFileHash(
        path.join(path.join(__dirname, '../source/fail'), item),
      );
    }),
  );
  const res2 = await Promise.all(
    pathsArr2.map((item) => {
      return getFileHash(
        path.join(path.join(__dirname, '../source/success'), item),
      );
    }),
  );
  res1.map((item, index) => {
    if (item !== res2[index]) {
      console.log(res2[index], item);
    }
  });
}
checkChunk();
