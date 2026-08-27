# mux-video-monitor

This repository contains two web "apps" for supporting streaming, primarily of conferences.

1. A tool for monitoring a number of video streams
2. A website for attendees to view the video streams from a conference

## Mux Data playback telemetry

The attendee HLS player supports per-room Mux Data telemetry. Configuration is
dynamic: add a `multiview:data-env-key` tag to each room's existing AWS Systems
Manager Parameter Store parameter under `/multiview/mux/`.

Mux API access tokens belong to a Mux environment, so use the Data environment
key from the same Mux environment as that room's token. The Data environment
key is a public browser identifier, not the SecureString token secret stored in
the parameter value.

For example:

```sh
aws ssm add-tags-to-resource \
  --region us-east-1 \
  --resource-type Parameter \
  --resource-id /multiview/mux/ROOM_MUX_TOKEN_ID \
  --tags Key=multiview:data-env-key,Value=ROOM_MUX_DATA_ENVIRONMENT_KEY
```

The backend reads this tag with the room metadata, caches it with stream state,
and returns it from `GET /api/stream/{roomId}`. No frontend rebuild is required
when the tag changes. Stream state has a 60-second cache, so allow up to a minute
before reloading an existing player to pick up a manually changed tag. Rooms
without the tag continue to play normally without sending Mux Data telemetry.

## Limitations

This was created for linux.conf.au & PyCon AU, and had no auth so was easy to test. 
With the latest changes to support the attendee view authentication is required,
which is provided by integration with events. Getting a cookie in place to test
the frontend locally involves changing `frontend/.proxyrc.js` to 

```javascript
const { globalAgent } = require('https');
const { createProxyMiddleware } = require('http-proxy-middleware');

const cookie = 'NDV_AUD=' + encodeURIComponent(process.env.NDV_AUD_COOKIE);

module.exports = function (app) {
  app.use(
    createProxyMiddleware('/api', {
      target: 'https://live.aws.nextdayvideo.com.au:443/',
      agent: globalAgent,
      cookieDomainRewrite: 'localhost',
      headers: {
        host: 'live.aws.nextdayvideo.com.au',
      },
      onProxyReq: function (proxyReq) {
        console.log('setting cookie');
        proxyReq.setHeader('cookie', cookie);
      },
    }),
  );
};
```

Thnen passing in your `NDV_AUD` cookie as the environment variable `NDV_AUD_COOKIE` 
when starting the frontend dev server.
