const { globalAgent } = require('https');
const { createProxyMiddleware } = require('http-proxy-middleware');
const localStreamPath = require('./localStreamPath');

const cookie = 'NDV_AUD=' + encodeURIComponent(process.env.NDV_AUD_COOKIE || '');
const localApiUrl = process.env.LOCAL_API_URL;

module.exports = function (app) {
  if (localApiUrl) {
    app.use(
      createProxyMiddleware({
        pathFilter: localStreamPath,
        target: localApiUrl,
      }),
    );
  }

  app.use(
    createProxyMiddleware({
      pathFilter: '/api',
      target: 'https://live.aws.nextdayvideo.com.au:443/',
      agent: globalAgent,
      cookieDomainRewrite: 'localhost',
      headers: {
        host: 'live.aws.nextdayvideo.com.au',
      },
      on: {
        proxyReq: function (proxyReq) {
          console.log('setting cookie');
          proxyReq.setHeader('cookie', cookie);
        },
      },
    }),
  );
};
