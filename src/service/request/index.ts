import { HttpRequest } from 'heng-request';

const httpRequest = new HttpRequest({
  baseURL: 'https://saberblog.topzhang.cn/',
  timeout: 5000,
  cancleRequests: [],
  handleCallback: {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    loadingStart: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    loadingEnd: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    responseErr: () => {},
  },
  interceptors: {
    requestInterceptor(config) {
      return config;
    },
    requestInterceptorCatch: (err) => {
      return Promise.reject(err);
    },
    responseInterceptor(res) {
      return res;
    },
    responseInterceptorCatch(err) {
      return Promise.reject(err);
    },
  },
});

export default httpRequest;
