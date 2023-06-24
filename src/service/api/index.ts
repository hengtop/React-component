/**
 * api请求方法封装
 */
import httpRequest from '../request';

/**演示代码 */
export const testApi = async () => {
  return await httpRequest.request({
    method: 'GET',
    url: '/api/test',
  });
};
