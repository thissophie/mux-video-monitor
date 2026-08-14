# Stream admin UI — design

**Date:** 2026-08-14
**Status:** Approved, ready for implementation planning

## Purpose

Give someone running an event a web page to edit the SSM tags that control which streams appear
in the monitor and attendee apps, without needing AWS console access or the CLI. Every edit must
leave the caches correct immediately, so a change made mid-event is visible right away.

## Scope

In scope: editing the four `multiview:*` tags on parameters that already exist under
`/multiview/mux/` in `us-east-1`, and refreshing caches after each edit.

Out of scope, by decision:

- Creating or deleting streams. Creating a parameter means writing a Mux token secret through the
  web app; six years of running this have needed no more than five streams, and adding one by hand
  is acceptable.
- Editing the parameter value (the Mux token secret) itself.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Which distribution hosts the page | Attendee (`live.aws.nextdayvideo.com.au`) | It is the only distribution whose `/api/*` behaviour forwards cookies (see below). |
| Refresh scope after an edit | Rooms cache + that stream's cache + Ably publish | `multiview:demo` and `multiview:title` feed the per-stream cache, which `/api/refresh` does not touch. |
| Role gating | Reuse `ATTEND_JWT_REQUIRED_ROLE` | Matches `/api/devtoken`; one group of trusted operators. |
| API shape | Two routes, per-room save | Localises failures to one room; avoids partial-batch semantics. |
| Testing | Wire up jest, unit-test the pure logic | AWS paths have no mocks in this repo and are not worth building for a helper UI. |

### Why the attendee distribution

The monitor distribution's `/api/*` cache behaviour
(`infra/main-stack/deployment.cfn.yaml:513-528`) uses the `Managed-CachingDisabled` cache policy and
sets **no** `OriginRequestPolicyId`, so CloudFront forwards no cookies to API Gateway. The attendee
distribution's equivalent (line 648) sets `Managed-AllViewerExceptHostHeader`. Cookie-authenticated
`/api/*` calls therefore only work on the attendee domain today. That domain is also what
`frontend/.proxyrc.js` proxies to, so local development exercises the same path.

Consequence: the S3 bucket is shared between both distributions, so `admin.html` will also be
reachable at `mux-monitor.aws.nextdayvideo.com.au/admin.html`, where it will load and then fail
every API call. This is noted on the page rather than blocked in infra.

## Backend

### New files

```
backend-lambda/src/
  helpers/requireRole.ts                    extracted from devtoken.ts:14-36
  handlers/adminListStreams.ts              GET  /admin/streams
  handlers/adminUpdateStream.ts             POST /admin/streams/{muxTokenId}
  handlers/admin/AdminStream.ts             types
  handlers/admin/listStreamsFromSSM.ts      unfiltered, paginated listing
  handlers/admin/parseTagEdits.ts           pure validation/coercion
  handlers/admin/applyTagEdits.ts           SSM Add/RemoveTagsFromResource
  handlers/admin/refreshAfterEdit.ts        rooms + stream + Ably
```

Modified: `src/index.ts` (two re-exports), `src/types.ts` and the regenerated `src/types.guard.ts`
(request body guard), `src/handlers/devtoken.ts` (switch to the shared helper).

### `helpers/requireRole.ts`

Extracted verbatim from the current `devtoken.ts` so behaviour is unchanged: call
`verifyTokenCookie(event, true)`; return `undefined` if there is no valid token, if
`ATTEND_JWT_REQUIRED_ROLE` is empty, or if the token's role matches none of the configured roles;
otherwise return `{ cookie, token }`. Handlers call it and return `accessDenied()` on `undefined`.
`devtoken.ts` is rewritten to use it, dropping about twelve lines.

### Listing

`listStreamsFromSSM.ts` calls `ssm.getParametersByPath({ Path: '/multiview/mux/' })` and **paginates
on `NextToken`**. The existing `getRoomsFromSSM.ts:15` does not paginate, so it silently caps at
SSM's default of 10 results; an admin list that truncates without saying so is a bad failure mode.
Tags come from the existing `getRoomWithTags`, dispatched through a `PQueue({ concurrency: 4 })`
exactly as `getRoomsFromSSM.ts:9` does.

`getParametersByPath` returns parameter *values*, which here are Mux token secrets. The
`AdminStream` type carries only `{ id, tags }` — no value field exists to populate — so secrets
never enter the response. `ssm:DescribeParameters` would avoid fetching them at all, but IAM does
not support resource-level permissions for that action; granting it would mean `Resource: "*"`,
widening the Lambda role from three `/multiview/*` paths to metadata on every parameter in the
account. Not a worthwhile trade, and `getParametersByPath` is already what the existing code calls.

This deliberately does not reuse `Room` or the `rooms/all` cache. Both filter to
`tags['multiview:show'] === 'true'` (`getRoomsFromSSM.ts:44`), so a room that had just been hidden
would disappear from the editor and become unrecoverable. Admin reads go straight to SSM every time.

`GET /admin/streams` responds with:

```json
{ "ok": true,
  "streams": [ { "id": "<muxTokenId>", "tags": { "multiview:title": "…", "multiview:order": "1",
                                                 "multiview:show": "true", "multiview:demo": "offline" } } ],
  "demos": ["offline", "fake-stream"] }
```

`demos` is `Object.keys(demos)` from `handlers/mux/demos.ts`. The frontend builds its demo dropdown
from this list rather than hardcoding the options, so the two cannot drift apart. Streams are sorted
by `multiview:order`, then by id, so the table order is stable across reloads.

### Tag semantics

| Tag | Accepted from client | Written as | Cleared when |
|---|---|---|---|
| `multiview:title` | string | trimmed string | empty after trim → tag removed |
| `multiview:order` | number or numeric string | `String(parseInt(v, 10))` | never; non-integer → 400 |
| `multiview:show` | boolean | literal `"true"` / `"false"` | never |
| `multiview:demo` | validated against `Object.keys(demos)` | the string | `null` → tag removed |

`multiview:show` is written as a literal string because the read path is a string comparison.
`multiview:demo` is validated against `handlers/mux/demos.ts` rather than a second hardcoded list,
so adding a demo there makes it selectable automatically. An empty title is dropped rather than
written as `""`, matching `getRoomWithTags.ts`, which already discards falsy tag values.

Clearing a tag is a `RemoveTagsFromResource` call, not an `AddTagsToResource` with an empty value.
`applyTagEdits` therefore makes up to two SSM calls: one add for tags being set, one remove for keys
being cleared.

### Data flow for a save

```
POST /admin/streams/{muxTokenId}
  → requireRole                         403 if not satisfied
  → parseBody + generated type guard    400 if malformed
  → parseTagEdits (pure)                400 if a value is invalid
  → applyTagEdits (SSM add/remove)
  → refreshAfterEdit
      getRoomsFromDynamo(TableName, true)
      getStreamStateFromDynamo(TableName, roomId, true)
      Ably publish to 'mux-monitor.aws.nextdayvideo.com.au'
        { roomId, why: 'admin-edit', ...state }
  → 200 with the room's new tag state
```

The Ably payload matches the shape `muxWebhook.ts:56` publishes, so existing subscribers need no
change.

## Error handling

- No or invalid cookie, or wrong role → `accessDenied()` (403). The frontend redirects to
  `/access-denied.html`.
- A path parameter that is missing or empty → `notFound()` (404), as `muxWebhook.ts:18-21` does.
- Unknown `muxTokenId` → `notFound()` (404). Detected by catching SSM's `InvalidResourceId` from the
  tag write — that is the error `AddTagsToResource`/`RemoveTagsFromResource` raise for a missing
  target, not `ParameterNotFound`, which belongs to the `GetParameter` family. There is no separate
  existence check, so there is no time-of-check/time-of-use gap. Confirm the exact error name
  against the SDK during implementation before relying on it.
- Malformed body or an invalid tag value → `invalidRequest()` (400) naming the offending field.
- SSM write failure → propagates through `catchErrors` as a 500; nothing has been cached, so a retry
  is safe.
- **Ably publish failure is logged and not fatal.** By that point the tags are written and both
  caches are refreshed. Returning 500 would report a failed save that actually succeeded. This
  mirrors `muxWebhook.ts:47-49`.

## Infra

`infra/main-stack/deployment.cfn.yaml`:

1. `BackendLambdaRole` policy gains `ssm:AddTagsToResource` and `ssm:RemoveTagsFromResource`. The
   existing `parameter/multiview/mux/*` resource entry already covers them;
   `ssm:GetParametersByPath` and `ssm:ListTagsForResource` are already granted.
2. Two `AWS::Lambda::Function` resources modelled on `BackendDevtokenFn` (line 161):

   | | `BackendAdminListStreamsFn` | `BackendAdminUpdateStreamFn` |
   |---|---|---|
   | Handler | `src/index.adminListStreams` | `src/index.adminUpdateStream` |
   | Env | `CACHE_TABLE_NAME`, `ATTEND_JWT_PRIVATE_KEY`, `ATTEND_JWT_ISSUER`, `ATTEND_JWT_AUDIENCE`, `ATTEND_JWT_REQUIRED_ROLE` | the same, plus `ABLY_SERVER_KEY: /multiview/ably/server` |

   `ABLY_SERVER_KEY` on the update function is the one omission that deploys clean and fails
   silently: `getAblyClient.ts:9` returns `success(undefined)` when it is unset, and the caller only
   logs "not notifying".
3. `BackendAdminListStreamsIntegration` + `BackendAdminListStreamsRoute` (`GET /admin/streams`), and
   `BackendAdminUpdateStreamIntegration` + `BackendAdminUpdateStreamRoute`
   (`POST /admin/streams/{muxTokenId}`).
4. All four added to `BackendAPIDeployment`'s `DependsOn` list.
5. Both function ARNs added to `BackendAPIRole`'s resource list.

Items 4 and 5 are the ones that otherwise produce a route that deploys but fails at runtime. The
API's existing `CorsConfiguration` already allows GET and POST, so it needs no change.

## Frontend

New: `src/admin.html`, `src/js/admin.ts`, `src/js/admin/fetchStreams.ts`,
`src/js/admin/saveStream.ts` — mirroring how `fetchRooms.ts` isolates its fetch from the page logic.
Parcel picks up `src/*.html` automatically, so no build config changes.

The page links `css/attend.css`, the Tailwind entry point the other attendee-side pages use.

One table, one row per stream, with title (text), order (number), show (checkbox) and demo (select:
*none* / `offline` / `fake-stream`, with options built from the API response so they track
`demos.ts`). Save is per row, with per-row status text; the button is disabled while a request is in
flight. A 403 response redirects to `/access-denied.html` using the existing `helpers/AccessDenied.ts`
pattern from `index.ts:20-23`.

## Testing

`backend-lambda` already lists `jest`, `@types/jest` and `ts-jest` as devDependencies but has no
config, no `test` script and no test files. Add a `jest.config.js` using ts-jest and a
`"test": "jest"` script — no new packages.

Unit tests cover the pure logic:

- `parseTagEdits.ts`: order coercion from number and numeric string; non-integer order rejected;
  show written as literal `"true"`/`"false"`; demo validated against `demos`; unknown demo rejected;
  `null` demo and empty title produce removals.
- The resulting add/remove call plan: which keys go to `AddTagsToResource` and which to
  `RemoveTagsFromResource`.

The AWS-touching paths stay untested; no mocking layer exists in this repo and building one for a
helper UI is not proportionate.

**Build hazard:** `tsconfig.json` includes `src/**/*.ts` with `outDir: dist`, and `build.prepare`
only removes `dist/test`. Colocated `*.test.ts` files would compile into `dist/` and ship inside
`build.zip`. Add `"**/*.test.ts"` to the tsconfig `exclude` list.

Adding files changes the hash computed by `backend-lambda/ci/current-object.sh`, which correctly
triggers one backend rebuild on deploy.

## Verification

Run the binaries directly; `pnpm run <script>` hangs in a network-restricted sandbox.

```
backend-lambda/  ./node_modules/.bin/tsc --noEmit
backend-lambda/  ./node_modules/.bin/jest
frontend/        ./node_modules/.bin/tsc --noEmit
```

Manual check against real AWS through the dev proxy: `pnpm start` in `frontend/` with a fresh
`NDV_AUD_COOKIE`, open `/admin.html`, edit a tag, confirm the change lands in SSM and that an open
monitor tab updates without a reload.
