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

### Local multi-room testing

Local development can replace SSM with an in-memory implementation while still
using the normal room discovery, tag handling, Mux stream lookup, API response,
and frontend code paths. Copy `.env.example` to the gitignored `.env` in the
repository root, then configure any number of entries under
`LOCAL_SSM_PARAMETERS`. Each entry is keyed by the same
`/multiview/mux/<Mux token ID>` path used in production and contains the
parameter `value` plus its SSM tags.

The example defines three visible rooms using the existing `fake-stream` demo.
Set each `multiview:data-env-key` tag to test Mux Data against that environment.
To use a real Mux environment, replace the path suffix and `value` with its API
token ID and secret, and remove the `multiview:demo` tag. Do not commit `.env`.

Run the API and frontend in separate terminals:

```sh
cd backend-lambda
pnpm run local
```

```sh
cd frontend
pnpm run start:local
```

Use these local pages:

- PyCon AU attendee list: `http://localhost:1234/attend-pyconau2026.html`
- PyCon AU room: `http://localhost:1234/play-pyconau2026.html?stream=local-room-1`
- Generic multiview: `http://localhost:1234/all.html`

Only the stream list and per-room endpoints use the local API. The existing
proxy continues to retrieve the production Ably client key, so set
`NDV_AUD_COOKIE` to a current cookie. Using production room IDs lets attendee
and multiview pages receive the normal events published by the existing Mux
webhook path. The local API does not read or change AWS, and this mode makes no
AWS configuration changes.

Local Parcel serves the generic monitor's `index.html` at `/`. Production uses
the same frontend build and S3 bucket for two CloudFront distributions:
`mux-monitor.aws.nextdayvideo.com.au` has `index.html` as its default root,
while `live.aws.nextdayvideo.com.au` has `attend-pyconau2026.html`. These
defaults are CloudFormation configuration, not SSM values, so locally use the
explicit attendee URL above.

## Limitations

This was created for linux.conf.au & PyCon AU, and had no auth so was easy to test. 
With the latest changes to support the attendee view authentication is required,
which is provided by integration with events. To proxy the frontend to the
deployed API instead of using the local SSM override, leave `LOCAL_API_URL`
unset and pass an `NDV_AUD` cookie as `NDV_AUD_COOKIE` when starting the
frontend dev server.
