# Stream Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-gated web page that lets an event operator edit the `multiview:*` SSM tags on existing `/multiview/mux/*` parameters, refreshing every affected cache after each edit.

**Architecture:** Two new Lambda handlers behind API Gateway — `GET /admin/streams` reads all parameters and their tags straight from SSM (unfiltered, so hidden rooms remain editable), and `POST /admin/streams/{muxTokenId}` validates a tag edit, writes it via SSM tagging APIs, then force-refreshes the rooms cache, that room's stream cache, and publishes to Ably. A single-page Parcel entry point (`admin.html`) renders one editable row per stream and saves rows independently.

**Tech Stack:** TypeScript, AWS SDK v3 (`@aws-sdk/client-ssm`, `@aws-sdk/client-dynamodb`), aws-lambda, jest + ts-jest (backend), Parcel + Tailwind v4 (frontend), CloudFormation.

**Spec:** `docs/superpowers/specs/2026-08-14-stream-admin-ui-design.md`

## Global Constraints

- `backend-lambda` is `strict: true`. `frontend` is `strict: false`. Do not assume frontend patterns typecheck in the backend.
- Errors are values. Use `helpers/result.ts` (`Result`/`success`/`failure`/`isFailure`/`successValue`). Do not throw for expected failures. Handlers wrap in `catchErrors` and return via `helpers/response.ts`.
- `backend-lambda/src/types.guard.ts` is **generated**. Edit `types.ts`, then run `./node_modules/.bin/ts-auto-guard --debug`. Never hand-edit the guard file.
- `pnpm run <script>` hangs in a network-restricted sandbox. Always call binaries directly: `./node_modules/.bin/tsc`, `./node_modules/.bin/jest`, `./node_modules/.bin/ts-auto-guard`, `./node_modules/.bin/prettier`.
- `pnpm lint` is broken in both projects (eslint 10 vs legacy `.eslintrc.js`). Do not try to fix it here. `./node_modules/.bin/prettier --check ./src/` works and is the formatting gate.
- Tag keys, exact strings: `multiview:title`, `multiview:order`, `multiview:show`, `multiview:demo`. Note `multiview`, not `multview`.
- `multiview:show` must be written as the literal string `"true"` or `"false"` — the read path at `getRoomsFromSSM.ts:44` is a string comparison.
- The SSM path prefix is `/multiview/mux/` and the region is `us-east-1`.
- The Ably channel name is exactly `mux-monitor.aws.nextdayvideo.com.au`.
- Never return an SSM parameter *value* to a client. Values under `/multiview/mux/` are Mux token secrets.
- Do not add routes to the monitor CloudFront distribution. It is deliberately unauthenticated (on-site event use); only the attendee distribution forwards cookies.
- Commit after every task.
- **Never write to AWS.** No `aws` CLI mutations, no CloudFormation deploys, no SSM tag writes, no
  running the `TEST_HANDLER` blocks (they hit real AWS through the default credential chain).
  Deployment happens only by merging to `main`. Tasks 1–6 are done on a branch and end at a pull
  request; Task 7 is Sophie's, after the merge deploys.
- Verification available in-session is limited to `tsc --noEmit`, `jest`, `prettier` and static
  checks of the CloudFormation template. Nothing else may be claimed as verified.

## File Structure

**Backend — create:**

| File | Responsibility |
|---|---|
| `backend-lambda/src/helpers/requireRole.ts` | Cookie verification + role check, shared by devtoken and both admin handlers |
| `backend-lambda/src/handlers/admin/AdminStream.ts` | Tag key constants and the `AdminStream` / `TagEditPlan` types |
| `backend-lambda/src/handlers/admin/parseTagEdits.ts` | Pure: request → validated add/remove plan |
| `backend-lambda/src/handlers/admin/parseTagEdits.test.ts` | Unit tests for the above |
| `backend-lambda/src/handlers/admin/listStreamsFromSSM.ts` | Paginated, unfiltered listing with tags |
| `backend-lambda/src/handlers/admin/applyTagEdits.ts` | Executes the plan via SSM tagging APIs |
| `backend-lambda/src/handlers/admin/refreshAfterEdit.ts` | Rooms cache + stream cache + Ably publish |
| `backend-lambda/src/handlers/adminListStreams.ts` | `GET /admin/streams` |
| `backend-lambda/src/handlers/adminUpdateStream.ts` | `POST /admin/streams/{muxTokenId}` |
| `backend-lambda/jest.config.js` | ts-jest harness |

**Backend — modify:** `src/index.ts`, `src/types.ts`, `src/types.guard.ts` (regenerated), `src/handlers/devtoken.ts`, `package.json`, `tsconfig.json`.

**Frontend — create:** `src/admin.html`, `src/js/admin.ts`, `src/js/admin/fetchStreams.ts`, `src/js/admin/saveStream.ts`.

**Infra — modify:** `infra/main-stack/deployment.cfn.yaml`.

---

### Task 1: Shared role helper

Extract the role check from `devtoken.ts` so all three protected endpoints share one implementation. Pure refactor — behaviour must not change.

**Files:**
- Create: `backend-lambda/src/helpers/requireRole.ts`
- Modify: `backend-lambda/src/handlers/devtoken.ts`

**Interfaces:**
- Consumes: `verifyTokenCookie` from `helpers/verifyTokenCookie.ts`, `JWTRequiredRole` from `helpers/env/ATTEND_JWT_REQUIRED_ROLE.ts`.
- Produces: `requireRole(event: APIGatewayProxyEventV2): Promise<{ cookie: string; token: DecodedJWT } | undefined>` — used by Tasks 3 and 4.

- [ ] **Step 1: Create the helper**

Create `backend-lambda/src/helpers/requireRole.ts`:

```typescript
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { verifyTokenCookie } from './verifyTokenCookie';
import { JWTRequiredRole } from './env/ATTEND_JWT_REQUIRED_ROLE';

/**
 * Verifies the NDV_AUD cookie and checks the token carries one of the roles in
 * ATTEND_JWT_REQUIRED_ROLE. Returns undefined when the caller should be denied.
 */
export const requireRole = async (event: APIGatewayProxyEventV2) => {
  const maybeToken = await verifyTokenCookie(event, true);

  if (!maybeToken) {
    return undefined;
  }

  const requiredRoles = (JWTRequiredRole ?? '')
    .split(',')
    .map((role) => role.trim())
    .filter((role) => role.length > 0);

  if (requiredRoles.length == 0) {
    console.log(
      `(requestId=${event.requestContext.requestId}) Access denied because ATTEND_JWT_REQUIRED_ROLE is not set.`,
    );
    return undefined;
  }

  const hasRequiredRole = requiredRoles.some((role) => role === maybeToken.token.role);
  if (!hasRequiredRole) {
    console.log(
      `(requestId=${event.requestContext.requestId}) Access denied because the token does not have any of ${requiredRoles.join(',')}.`,
    );

    return undefined;
  }

  return maybeToken;
};
```

- [ ] **Step 2: Rewrite devtoken to use it**

Replace the entire contents of `backend-lambda/src/handlers/devtoken.ts`:

```typescript
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { TableName } from '../helpers/TableName';
import { catchErrors } from '../helpers/catchErrors';
import { accessDenied, response } from '../helpers/response';
import { requireRole } from '../helpers/requireRole';

export const devtoken: APIGatewayProxyHandlerV2 = catchErrors(async (event) => {
  if (!TableName) {
    throw new Error('CACHE_TABLE_NAME not set');
  }

  const maybeToken = await requireRole(event);

  if (!maybeToken) {
    return accessDenied();
  }

  return response(
    {
      ok: true,
      cookie: maybeToken.cookie,
    },
    200,
    {
      'Cache-Control': 'no-cache',
    },
  );
});
```

Note the handler now takes only `event`. `catchErrors` accepts a two-parameter function, and a one-parameter function is assignable to it, so the `eslint-disable` comment for the unused `context` is no longer needed.

- [ ] **Step 3: Typecheck**

Run from `backend-lambda/`: `./node_modules/.bin/tsc --noEmit`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add backend-lambda/src/helpers/requireRole.ts backend-lambda/src/handlers/devtoken.ts
git commit -m "refactor: extract requireRole helper from devtoken"
```

---

### Task 2: Tag edit validation (with jest harness)

The pure core of the feature. Sets up the jest harness because this is the first test in `backend-lambda`.

**Files:**
- Create: `backend-lambda/jest.config.js`
- Create: `backend-lambda/src/handlers/admin/AdminStream.ts`
- Create: `backend-lambda/src/handlers/admin/parseTagEdits.ts`
- Test: `backend-lambda/src/handlers/admin/parseTagEdits.test.ts`
- Modify: `backend-lambda/package.json`, `backend-lambda/tsconfig.json`

**Interfaces:**
- Consumes: `Result`/`success`/`failure` from `helpers/result.ts`.
- Produces:
  - `TAG_TITLE`, `TAG_ORDER`, `TAG_SHOW`, `TAG_DEMO` string constants
  - `type AdminTags = Record<string, string>`
  - `interface AdminStream { id: string; tags: AdminTags }`
  - `interface TagEditPlan { set: AdminTags; remove: string[] }`
  - `parseTagEdits(request: AdminTagEditRequest, validDemos: string[]): Result<Error, TagEditPlan>`

  Tasks 3, 4 and 6 depend on these exact names.

- [ ] **Step 1: Set up the jest harness**

**Do not use the `ts-jest` devDependency, despite it already being present.** ts-jest 29 cannot
drive the TypeScript 7 compiler API this project pins — it fails with "does not expose the
JavaScript compiler API required by ts-jest" and suggests aliasing a TypeScript 6 package.
Downgrading TypeScript is the wrong fix. Use `@swc/jest`, which is what `frontend/jest.config.js`
already uses.

That needs two devDependencies. The registry is unreachable in this sandbox, so install from pnpm's
local content-addressed store, which already has them because the frontend uses them:

```bash
pnpm add -D --offline @swc/core@^1.15.46 @swc/jest@^0.2.39
```

Expected: `+ @swc/core` and `+ @swc/jest`, with `package.json` and `pnpm-lock.yaml` both updated. The
`ERR_PNPM_IGNORED_BUILDS` warning about `@swc/core` build scripts is fine — the native binary ships
as a platform-specific optional dependency, not from a build script.

Create `backend-lambda/jest.config.js`:

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  // dist/ holds a copy of package.json after a build, which jest's haste map
  // reports as a duplicate of the real one.
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  // @swc/jest rather than ts-jest: ts-jest 29 cannot use the TypeScript 7
  // compiler API this project pins. Matches frontend/jest.config.js.
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' },
          target: 'es2020',
        },
      },
    ],
  },
};
```

`@swc/jest` transpiles without type-checking, and the `exclude` below keeps test files out of
`tsc`'s program — so **test files are not type-checked by anything**. That is the same trade
`frontend` already makes. `tsc --noEmit` still covers all non-test source.

Add a `test` script to `backend-lambda/package.json`, immediately after the `"watch"` line:

```json
    "test": "ts-auto-guard --debug && jest",
```

The `ts-auto-guard` call is not optional. `src/types.guard.ts` is generated **and gitignored**, so a
fresh clone does not have it — and `helpers/verifyToken.ts` imports it, which means any test that
transitively reaches a handler fails with `Cannot find module '../types.guard'`. Generating it as
part of `test` fixes CI and a fresh local clone in one place. Running `./node_modules/.bin/jest`
directly skips this, which is fine once the file exists.

In `backend-lambda/tsconfig.json`, change the `exclude` array so test files are never emitted into `dist/` (and therefore never shipped inside `build.zip`):

```json
  "exclude": [
      "node_modules",
      "**/*.test.ts"
  ]
```

- [ ] **Step 2: Create the shared types**

Create `backend-lambda/src/handlers/admin/AdminStream.ts`:

```typescript
export const TAG_TITLE = 'multiview:title';
export const TAG_ORDER = 'multiview:order';
export const TAG_SHOW = 'multiview:show';
export const TAG_DEMO = 'multiview:demo';

export type AdminTags = Record<string, string>;

/** One SSM parameter under /multiview/mux/. Never carries the parameter value. */
export interface AdminStream {
  id: string;
  tags: AdminTags;
}

/** Tags to write, and tag keys to delete. */
export interface TagEditPlan {
  set: AdminTags;
  remove: string[];
}
```

- [ ] **Step 3: Add the request type and regenerate the guard**

Append to `backend-lambda/src/types.ts`:

```typescript
/** @see {isAdminTagEditRequest} ts-auto-guard:type-guard */
export interface AdminTagEditRequest {
  title?: string;
  order?: string | number;
  show?: boolean;
  demo?: string | null;
}
```

Regenerate from `backend-lambda/`: `./node_modules/.bin/ts-auto-guard --debug`

Confirm `src/types.guard.ts` now exports `isAdminTagEditRequest`. Do not hand-edit that file.

- [ ] **Step 4: Write the failing tests**

Create `backend-lambda/src/handlers/admin/parseTagEdits.test.ts`:

```typescript
import { isFailure, isSuccess, successValue } from '../../helpers/result';
import { TAG_DEMO, TAG_ORDER, TAG_SHOW, TAG_TITLE } from './AdminStream';
import { parseTagEdits } from './parseTagEdits';

const demos = ['offline', 'fake-stream'];

const planFor = (request: Parameters<typeof parseTagEdits>[0]) => {
  const result = parseTagEdits(request, demos);
  if (!isSuccess(result)) {
    throw new Error(`Expected success, got failure: ${result.value.message}`);
  }
  return successValue(result);
};

describe('parseTagEdits', () => {
  it('returns an empty plan for an empty request', () => {
    expect(planFor({})).toEqual({ set: {}, remove: [] });
  });

  it('writes order from a number', () => {
    expect(planFor({ order: 5 }).set[TAG_ORDER]).toBe('5');
  });

  it('writes order from a numeric string', () => {
    expect(planFor({ order: '5' }).set[TAG_ORDER]).toBe('5');
  });

  it('accepts a negative order', () => {
    expect(planFor({ order: '-2' }).set[TAG_ORDER]).toBe('-2');
  });

  it('rejects a partially numeric order rather than truncating it', () => {
    expect(isFailure(parseTagEdits({ order: '12abc' }, demos))).toBe(true);
  });

  it('rejects a non-integer order', () => {
    expect(isFailure(parseTagEdits({ order: 1.5 }, demos))).toBe(true);
  });

  it('rejects an empty order', () => {
    expect(isFailure(parseTagEdits({ order: '' }, demos))).toBe(true);
  });

  it('writes show as the literal string true', () => {
    expect(planFor({ show: true }).set[TAG_SHOW]).toBe('true');
  });

  it('writes show as the literal string false', () => {
    expect(planFor({ show: false }).set[TAG_SHOW]).toBe('false');
  });

  it('trims the title', () => {
    expect(planFor({ title: '  Room One  ' }).set[TAG_TITLE]).toBe('Room One');
  });

  it('removes the title tag when the title is blank', () => {
    const plan = planFor({ title: '   ' });
    expect(plan.remove).toContain(TAG_TITLE);
    expect(plan.set[TAG_TITLE]).toBeUndefined();
  });

  it('accepts a known demo', () => {
    expect(planFor({ demo: 'fake-stream' }).set[TAG_DEMO]).toBe('fake-stream');
  });

  it('rejects an unknown demo', () => {
    expect(isFailure(parseTagEdits({ demo: 'nope' }, demos))).toBe(true);
  });

  it('removes the demo tag when demo is null', () => {
    const plan = planFor({ demo: null });
    expect(plan.remove).toContain(TAG_DEMO);
    expect(plan.set[TAG_DEMO]).toBeUndefined();
  });

  it('handles a full edit in one plan', () => {
    const plan = planFor({ title: 'Main Hall', order: 1, show: true, demo: null });
    expect(plan.set).toEqual({
      [TAG_TITLE]: 'Main Hall',
      [TAG_ORDER]: '1',
      [TAG_SHOW]: 'true',
    });
    expect(plan.remove).toEqual([TAG_DEMO]);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run from `backend-lambda/`: `./node_modules/.bin/jest`
Expected: FAIL — cannot resolve `./parseTagEdits`.

`@swc/jest` does not read `tsconfig.json`, so the `**/*.test.ts` exclude added in Step 1 does not
affect the test run. Confirm the exclude is doing its job with:

```bash
./node_modules/.bin/tsc --noEmit --listFiles | grep -c "parseTagEdits.test.ts"
```

Expected: `0`. A non-zero count means test files would be emitted into `dist/` and shipped inside
`build.zip`.

- [ ] **Step 6: Implement**

Create `backend-lambda/src/handlers/admin/parseTagEdits.ts`:

```typescript
import { failure, Result, success } from '../../helpers/result';
import { AdminTagEditRequest } from '../../types';
import { TAG_DEMO, TAG_ORDER, TAG_SHOW, TAG_TITLE, TagEditPlan } from './AdminStream';

const INTEGER = /^-?\d+$/;

/**
 * Validates a tag edit request and turns it into tags to write and tag keys to
 * delete. Pure: does no IO. `validDemos` comes from handlers/mux/demos.ts so the
 * accepted values cannot drift from the ones the player understands.
 */
export const parseTagEdits = (request: AdminTagEditRequest, validDemos: string[]): Result<Error, TagEditPlan> => {
  const set: Record<string, string> = {};
  const remove: string[] = [];

  if (request.title !== undefined) {
    const title = request.title.trim();
    if (title.length === 0) {
      // getRoomWithTags discards falsy tag values, so an empty title is a removal.
      remove.push(TAG_TITLE);
    } else {
      set[TAG_TITLE] = title;
    }
  }

  if (request.order !== undefined) {
    if (typeof request.order === 'number') {
      if (!Number.isInteger(request.order)) {
        return failure(new Error('order must be a whole number'));
      }
      set[TAG_ORDER] = String(request.order);
    } else {
      // parseInt('12abc') is 12, so test the whole string before converting.
      if (!INTEGER.test(request.order.trim())) {
        return failure(new Error('order must be a whole number'));
      }
      set[TAG_ORDER] = String(parseInt(request.order.trim(), 10));
    }
  }

  if (request.show !== undefined) {
    set[TAG_SHOW] = request.show ? 'true' : 'false';
  }

  if (request.demo !== undefined) {
    if (request.demo === null) {
      remove.push(TAG_DEMO);
    } else if (!validDemos.includes(request.demo)) {
      return failure(new Error(`demo must be one of ${validDemos.join(', ')}`));
    } else {
      set[TAG_DEMO] = request.demo;
    }
  }

  return success({ set, remove });
};
```

- [ ] **Step 7: Run the tests to verify they pass**

Run from `backend-lambda/`: `./node_modules/.bin/jest`
Expected: PASS, 15 tests.

Then `./node_modules/.bin/tsc --noEmit` — expected: no output.

- [ ] **Step 8: Commit**

```bash
git add backend-lambda/jest.config.js backend-lambda/package.json backend-lambda/tsconfig.json \
        backend-lambda/src/types.ts backend-lambda/src/types.guard.ts \
        backend-lambda/src/handlers/admin/
git commit -m "feat: add tag edit validation and a jest harness for backend-lambda"
```

---

### Task 3: List streams endpoint

**Files:**
- Create: `backend-lambda/src/handlers/admin/listStreamsFromSSM.ts`
- Create: `backend-lambda/src/handlers/adminListStreams.ts`
- Modify: `backend-lambda/src/index.ts`

**Interfaces:**
- Consumes: `AdminStream`, `AdminTags`, `TAG_ORDER` (Task 2); `requireRole` (Task 1); `getRoomWithTags` from `handlers/rooms/getRoomWithTags.ts`; `getOrderFromTag` from `handlers/rooms/getOrderFromTag.ts`; `demos` from `handlers/mux/demos.ts`.
- Produces: `listStreamsFromSSM(): Promise<Result<Error, AdminStream[]>>`; the `adminListStreams` handler export.

- [ ] **Step 1: Implement the listing**

Create `backend-lambda/src/handlers/admin/listStreamsFromSSM.ts`:

```typescript
import PQueue from '@esm2cjs/p-queue';
import { notUndefined } from '../../helpers/notUndefined';
import { failure, isFailure, isSuccess, Result, success, successValue } from '../../helpers/result';
import { ssm } from '../../helpers/ssm';
import { getOrderFromTag } from '../rooms/getOrderFromTag';
import { getRoomWithTags, RoomWithTags } from '../rooms/getRoomWithTags';
import { AdminStream, AdminTags, TAG_ORDER } from './AdminStream';

const path = '/multiview/mux/';

const tagsQueue = new PQueue({ concurrency: 4 });

const orderOf = (tags: AdminTags): number => getOrderFromTag(tags[TAG_ORDER], Number.MAX_SAFE_INTEGER);

/**
 * Every parameter under /multiview/mux/ with its tags, unfiltered — unlike
 * getRoomsFromSSM, which drops anything without multiview:show=true. The admin UI
 * must be able to see (and un-hide) hidden rooms.
 *
 * Only Name is read from the response. The parameter values are Mux token secrets
 * and must never reach a client.
 */
export const listStreamsFromSSM = async (): Promise<Result<Error, AdminStream[]>> => {
  const names: string[] = [];
  let nextToken: string | undefined = undefined;

  // getParametersByPath returns 10 per page by default. getRoomsFromSSM does not
  // paginate; an admin list that silently truncates would be a bad failure mode.
  do {
    const page = await ssm.getParametersByPath({ Path: path, NextToken: nextToken });

    if (page.Parameters == null) {
      return failure(new Error('Unexpected AWS response'));
    }

    names.push(...page.Parameters.map(({ Name }) => Name).filter(notUndefined));

    nextToken = page.NextToken;
  } while (nextToken !== undefined);

  // PQueue.add resolves to `Result | void`, so the null check is not optional —
  // this mirrors getRoomsFromSSM.ts:26-31 rather than using `??`, which does not
  // narrow a `void` union cleanly under strict.
  const settled = await Promise.all(names.map((name) => tagsQueue.add(() => getRoomWithTags(ssm, name))));

  const maybeStreams = settled.map((r) => {
    if (r == null) {
      return failure<Error, RoomWithTags>(new Error('Cancelled'));
    }
    return r;
  });

  const errors = maybeStreams.filter(isFailure).map(({ value }) => value);

  if (errors.length > 0) {
    return failure(new Error(`${errors.length} errors fetching tags. ${errors.map((e) => e.message).join(', ')}`));
  }

  const streams = maybeStreams
    .filter(isSuccess)
    .map(successValue)
    .map(({ id, tags }) => ({ id: id.substring(path.length), tags }))
    .sort((first, second) => orderOf(first.tags) - orderOf(second.tags) || first.id.localeCompare(second.id));

  return success(streams);
};
```

- [ ] **Step 2: Implement the handler**

Create `backend-lambda/src/handlers/adminListStreams.ts`:

```typescript
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { catchErrors } from '../helpers/catchErrors';
import { accessDenied, response } from '../helpers/response';
import { isFailure, successValue } from '../helpers/result';
import { requireRole } from '../helpers/requireRole';
import { demos } from './mux/demos';
import { listStreamsFromSSM } from './admin/listStreamsFromSSM';

export const adminListStreams: APIGatewayProxyHandlerV2 = catchErrors(async (event) => {
  if (!(await requireRole(event))) {
    return accessDenied();
  }

  const maybeStreams = await listStreamsFromSSM();

  if (isFailure(maybeStreams)) {
    throw maybeStreams.value;
  }

  return response(
    {
      ok: true,
      streams: successValue(maybeStreams),
      // The UI builds its demo dropdown from this, so the two cannot drift.
      demos: Object.keys(demos),
    },
    200,
    {
      'Cache-Control': 'no-cache',
    },
  );
});
```

- [ ] **Step 3: Export it**

Add to `backend-lambda/src/index.ts`, after the `devtoken` line:

```typescript
export { adminListStreams } from './handlers/adminListStreams';
```

- [ ] **Step 4: Typecheck**

Run from `backend-lambda/`: `./node_modules/.bin/tsc --noEmit`
Expected: no output.

The `page` annotation is required, not stylistic. Without it `tsc` fails with `TS7022: 'page'
implicitly has type 'any' because it is referenced directly or indirectly in its own initializer` —
`nextToken` is assigned from `page`, which comes from a call that takes `nextToken`. Keep both the
`GetParametersByPathResult` annotation and the explicit `let nextToken: string | undefined`; do not
switch to `while (true)` with a `break`.

- [ ] **Step 5: Commit**

```bash
git add backend-lambda/src/handlers/admin/listStreamsFromSSM.ts \
        backend-lambda/src/handlers/adminListStreams.ts backend-lambda/src/index.ts
git commit -m "feat: add GET /admin/streams"
```

---

### Task 4: Update stream endpoint

**Files:**
- Create: `backend-lambda/src/handlers/admin/applyTagEdits.ts`
- Create: `backend-lambda/src/handlers/admin/readRoomTags.ts`
- Create: `backend-lambda/src/handlers/admin/refreshAfterEdit.ts`
- Create: `backend-lambda/src/handlers/adminUpdateStream.ts`
- Modify: `backend-lambda/src/index.ts`

**Interfaces:**
- Consumes: `TagEditPlan`, `AdminTags`, `parseTagEdits` (Task 2); `requireRole` (Task 1); `isAdminTagEditRequest` from `types.guard.ts`; `getRoomsFromDynamo`, `getStreamStateFromDynamo`, `getAblyClient`, `getRoomWithTags`, `parseBody`, `TableName`.
- Produces:
  - `applyTagEdits(ssm: SSM, roomId: string, plan: TagEditPlan): Promise<Result<Error, void>>`
  - `isMissingParameterError(err: Error): boolean`
  - `refreshAfterEdit(tableName: string, roomId: string): Promise<Result<Error, StreamStateWithTitle>>`
  - the `adminUpdateStream` handler export

- [ ] **Step 1: Confirm the SSM not-found error name**

Before writing the code, confirm what `addTagsToResource` throws for a parameter that does not exist. Run from `backend-lambda/`:

```bash
grep -rn "InvalidResourceId" node_modules/@aws-sdk/client-ssm/dist-types/models/ | head
```

Expected: a hit for an `InvalidResourceId` exception class. The AWS SDK sets `err.name` to the exception's shape name. If the grep finds nothing, list the exceptions the operation declares and use the correct name in Step 2 instead of `InvalidResourceId`. Do not use `ParameterNotFound` — that belongs to the `GetParameter` family, not the tagging APIs.

**Outcome when this plan was executed:** `InvalidResourceId` is declared for `AddTagsToResource`,
`RemoveTagsFromResource` and `ListTagsForResource`. `ParameterNotFound` is not. The constant is correct.

Whether `removeTagsFromResource` is a no-op for a `TagKeys` entry that is not present on the
parameter is **not** answerable from the SDK types, and this repo cannot call AWS. Rather than ship
an unverifiable assumption, the fallback described here was taken as the default: `adminUpdateStream`
reads the current tags *before* `applyTagEdits` and filters `plan.remove` to keys that exist. That
also turns an unknown `muxTokenId` into a 404 instead of a 500, because `getRoomWithTags` throws
rather than returning a failure when the parameter is missing. The extra read is one
`ListTagsForResource` call per save.

- [ ] **Step 2: Implement the tag write**

Create `backend-lambda/src/handlers/admin/applyTagEdits.ts`:

```typescript
import { SSM } from '@aws-sdk/client-ssm';
import { failure, Result, success } from '../../helpers/result';
import { TagEditPlan } from './AdminStream';

/**
 * SSM raises InvalidResourceId when the tag target does not exist. That is the
 * only signal we get that the roomId is wrong, since we do no separate existence
 * check (which would leave a time-of-check/time-of-use gap anyway).
 */
export const isMissingParameterError = (err: Error): boolean => err.name === 'InvalidResourceId';

/**
 * Applies a plan with up to two SSM calls. Clearing a tag is a RemoveTagsFromResource
 * call, not an AddTagsToResource with an empty value.
 */
export const applyTagEdits = async (ssm: SSM, roomId: string, plan: TagEditPlan): Promise<Result<Error, void>> => {
  const ResourceId = `/multiview/mux/${roomId}`;

  const tags = Object.entries(plan.set).map(([Key, Value]) => ({ Key, Value }));

  try {
    if (tags.length > 0) {
      await ssm.addTagsToResource({ ResourceType: 'Parameter', ResourceId, Tags: tags });
    }

    if (plan.remove.length > 0) {
      await ssm.removeTagsFromResource({ ResourceType: 'Parameter', ResourceId, TagKeys: plan.remove });
    }
  } catch (err) {
    return failure(err as Error);
  }

  return success(undefined);
};
```

- [ ] **Step 3: Implement the refresh**

Create `backend-lambda/src/handlers/admin/refreshAfterEdit.ts`:

```typescript
import { isFailure, Result, success, successValue } from '../../helpers/result';
import { getRoomsFromDynamo } from '../rooms/getRoomsFromDynamo';
import { getStreamStateFromDynamo } from '../mux/getStreamStateFromDynamo';
import { getAblyClient } from '../ably/getAblyClient';
import { StreamStateWithTitle } from '../mux/StreamState';

const CHANNEL = 'mux-monitor.aws.nextdayvideo.com.au';

/**
 * A tag edit can change both caches: multiview:show and multiview:order feed
 * rooms/all, while multiview:title and multiview:demo feed stream/<roomId>.
 * /api/refresh only does the former, so both are forced here.
 *
 * The Ably publish is best-effort. By the time it runs the tags are written and
 * both caches are correct, so a publish failure must not be reported as a failed
 * save.
 */
export const refreshAfterEdit = async (
  tableName: string,
  roomId: string,
): Promise<Result<Error, StreamStateWithTitle>> => {
  const maybeAblyTask = getAblyClient();

  const maybeRooms = await getRoomsFromDynamo(tableName, true);
  if (isFailure(maybeRooms)) {
    return maybeRooms;
  }

  const maybeState = await getStreamStateFromDynamo(tableName, roomId, true);
  if (isFailure(maybeState)) {
    return maybeState;
  }

  const state = successValue(maybeState);

  const maybeAbly = await maybeAblyTask;

  if (isFailure(maybeAbly)) {
    console.log('Failed to initialise ably', maybeAbly.value);
  } else {
    const ably = successValue(maybeAbly);

    if (ably == undefined) {
      console.log('Not notifying ably (ABLY_SERVER_KEY not set)');
    } else {
      try {
        await ably.channels.get(CHANNEL).publish('stream', { roomId, why: 'admin-edit', ...state });
      } catch (err) {
        console.log('Failed to publish to ably', err);
      }
    }
  }

  return success(state);
};
```

- [ ] **Step 4: Implement the handler**

Create `backend-lambda/src/handlers/adminUpdateStream.ts`:

```typescript
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { catchErrors } from '../helpers/catchErrors';
import { accessDenied, invalidRequest, notFound, response } from '../helpers/response';
import { isFailure, successValue } from '../helpers/result';
import { parseBody } from '../helpers/parseBody';
import { requireRole } from '../helpers/requireRole';
import { ssm } from '../helpers/ssm';
import { TableName } from '../helpers/TableName';
import { isAdminTagEditRequest } from '../types.guard';
import { demos } from './mux/demos';
import { applyTagEdits, isMissingParameterError } from './admin/applyTagEdits';
import { parseTagEdits } from './admin/parseTagEdits';
import { refreshAfterEdit } from './admin/refreshAfterEdit';
import { getRoomWithTags } from './rooms/getRoomWithTags';

export const adminUpdateStream: APIGatewayProxyHandlerV2 = catchErrors(async (event) => {
  if (!TableName) {
    throw new Error('CACHE_TABLE_NAME not set');
  }

  if (!(await requireRole(event))) {
    return accessDenied();
  }

  const roomId = event.pathParameters?.muxTokenId;
  if (roomId === undefined || roomId.length === 0) {
    return notFound();
  }

  const maybeBody = parseBody(event.body, isAdminTagEditRequest);
  if (isFailure(maybeBody)) {
    return invalidRequest('Body must be a tag edit request');
  }

  const maybePlan = parseTagEdits(successValue(maybeBody), Object.keys(demos));
  if (isFailure(maybePlan)) {
    return invalidRequest(maybePlan.value.message);
  }

  const maybeApplied = await applyTagEdits(ssm, roomId, successValue(maybePlan));
  if (isFailure(maybeApplied)) {
    if (isMissingParameterError(maybeApplied.value)) {
      console.log(`No parameter for ${roomId}`);
      return notFound();
    }
    throw maybeApplied.value;
  }

  // The tags are already committed. A refresh failure must not be reported as a
  // failed save: getStreamStateFromDynamo reaches Mux, so clearing multiview:demo
  // on a stream that is not currently live fails here for a save that landed
  // correctly. Report it separately and let the 60s TTL catch up.
  const maybeRefreshed = await refreshAfterEdit(TableName, roomId);
  if (isFailure(maybeRefreshed)) {
    console.log(`Tags written for ${roomId} but the refresh failed`, maybeRefreshed.value);
  }

  const maybeTags = await getRoomWithTags(ssm, `/multiview/mux/${roomId}`);
  if (isFailure(maybeTags)) {
    throw maybeTags.value;
  }

  return response(
    {
      ok: true,
      refreshed: !isFailure(maybeRefreshed),
      stream: { id: roomId, tags: successValue(maybeTags).tags },
    },
    200,
    {
      'Cache-Control': 'no-cache',
    },
  );
});
```

- [ ] **Step 5: Export it**

Add to `backend-lambda/src/index.ts`:

```typescript
export { adminUpdateStream } from './handlers/adminUpdateStream';
```

- [ ] **Step 6: Verify**

Run from `backend-lambda/`:
- `./node_modules/.bin/tsc --noEmit` — expected: no output.
- `./node_modules/.bin/jest` — expected: PASS, 15 tests.

- [ ] **Step 7: Commit**

```bash
git add backend-lambda/src/handlers/admin/applyTagEdits.ts \
        backend-lambda/src/handlers/admin/refreshAfterEdit.ts \
        backend-lambda/src/handlers/adminUpdateStream.ts backend-lambda/src/index.ts
git commit -m "feat: add POST /admin/streams/{muxTokenId}"
```

---

### Task 5: CloudFormation wiring

Five separate edits. Missing any of the last two produces routes that deploy cleanly and then fail at runtime.

**Files:**
- Modify: `infra/main-stack/deployment.cfn.yaml`

**Interfaces:**
- Consumes: the `adminListStreams` and `adminUpdateStream` exports from Tasks 3 and 4.
- Produces: `GET /api/admin/streams` and `POST /api/admin/streams/{muxTokenId}`, live on the attendee distribution.

- [ ] **Step 1: Grant the tagging permissions**

Add a **new** policy rather than extending `CanReadFromSSM`. That policy's `Resource` list also covers
the ably and attend paths, so adding write actions there would grant tagging on secrets the admin UI
has no reason to touch — and would leave a policy named "CanReadFromSSM" granting writes. Insert
after the `CanReadFromSSM` resource:

```yaml
  # Separate from CanReadFromSSM so tagging stays scoped to the mux parameters --
  # the admin UI has no reason to retag the ably or attend secrets.
  CanTagMuxParameters:
    Type: "AWS::IAM::Policy"
    Properties:
      PolicyName: "CanTagMuxParameters"
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: "Allow"
            Action:
              - "ssm:AddTagsToResource"
              - "ssm:RemoveTagsFromResource"
            Resource:
              - !Sub "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/multiview/mux/*"
      Roles:
        - !Ref "BackendLambdaRole"
```

- [ ] **Step 2: Add the two functions**

Insert after the `BackendDevtokenFn` block (which ends around line 178), modelled on it:

```yaml
  BackendAdminListStreamsFn:
    Type: AWS::Lambda::Function
    Properties:
      Code:
        S3Bucket: !Ref BackendLambdaS3Bucket
        S3Key: !Ref BackendLambdaS3Key
      Handler: src/index.adminListStreams
      Role: !GetAtt "BackendLambdaRole.Arn"
      Runtime: "nodejs24.x"
      Timeout: 25
      Environment:
        Variables:
          CACHE_TABLE_NAME: !Ref "CacheTable"
          ATTEND_JWT_PRIVATE_KEY: "/multiview/attend/ATTEND_JWT_PRIVATE_KEY"
          ATTEND_JWT_ISSUER: !Ref "AttendJWTIssuer"
          ATTEND_JWT_AUDIENCE: !Ref "AttendJWTAudience"
          ATTEND_JWT_REQUIRED_ROLE: 826205

  BackendAdminUpdateStreamFn:
    Type: AWS::Lambda::Function
    Properties:
      Code:
        S3Bucket: !Ref BackendLambdaS3Bucket
        S3Key: !Ref BackendLambdaS3Key
      Handler: src/index.adminUpdateStream
      Role: !GetAtt "BackendLambdaRole.Arn"
      Runtime: "nodejs24.x"
      Timeout: 25
      Environment:
        Variables:
          CACHE_TABLE_NAME: !Ref "CacheTable"
          ABLY_SERVER_KEY: "/multiview/ably/server"
          ATTEND_JWT_PRIVATE_KEY: "/multiview/attend/ATTEND_JWT_PRIVATE_KEY"
          ATTEND_JWT_ISSUER: !Ref "AttendJWTIssuer"
          ATTEND_JWT_AUDIENCE: !Ref "AttendJWTAudience"
          ATTEND_JWT_REQUIRED_ROLE: 826205
```

`ABLY_SERVER_KEY` on the update function is load-bearing and fails silently if omitted: `getAblyClient.ts:9` returns `success(undefined)` when it is unset, and the caller only logs "not notifying". The list function does not publish and does not need it.

- [ ] **Step 3: Add integrations and routes**

Insert after `BackendDevtokenRoute` (around line 366):

```yaml
  BackendAdminListStreamsIntegration:
    Type: AWS::ApiGatewayV2::Integration
    Properties:
      ApiId: !Ref BackendAPI
      Description: "Admin: list streams"
      ConnectionType: INTERNET
      CredentialsArn: !GetAtt "BackendAPIRole.Arn"
      PassthroughBehavior: "WHEN_NO_MATCH"
      TimeoutInMillis: 29000
      IntegrationMethod: "POST"
      IntegrationType: "AWS_PROXY"
      PayloadFormatVersion: "2.0"
      IntegrationUri: !Sub "arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${BackendAdminListStreamsFn.Arn}/invocations"

  BackendAdminListStreamsRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
      ApiId: !Ref BackendAPI
      RouteKey: GET /admin/streams
      Target: !Sub "integrations/${BackendAdminListStreamsIntegration}"

  BackendAdminUpdateStreamIntegration:
    Type: AWS::ApiGatewayV2::Integration
    Properties:
      ApiId: !Ref BackendAPI
      Description: "Admin: update stream tags"
      ConnectionType: INTERNET
      CredentialsArn: !GetAtt "BackendAPIRole.Arn"
      PassthroughBehavior: "WHEN_NO_MATCH"
      TimeoutInMillis: 29000
      IntegrationMethod: "POST"
      IntegrationType: "AWS_PROXY"
      PayloadFormatVersion: "2.0"
      IntegrationUri: !Sub "arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${BackendAdminUpdateStreamFn.Arn}/invocations"

  BackendAdminUpdateStreamRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
      ApiId: !Ref BackendAPI
      RouteKey: POST /admin/streams/{muxTokenId}
      Target: !Sub "integrations/${BackendAdminUpdateStreamIntegration}"
```

`IntegrationMethod: "POST"` is correct for **both** — it is how API Gateway invokes Lambda, not the route's HTTP method. Every existing integration in this file uses it, including the `GET` ones.

- [ ] **Step 4: Add to the deployment DependsOn**

In `BackendAPIDeployment`'s `DependsOn` list (around line 439), add all four:

```yaml
      - BackendAdminListStreamsRoute
      - BackendAdminListStreamsIntegration
      - BackendAdminUpdateStreamRoute
      - BackendAdminUpdateStreamIntegration
```

- [ ] **Step 5: Add to the API role**

In `BackendAPIRole`'s `Resource` list (around line 257), add both ARNs:

```yaml
                  - !GetAtt BackendAdminListStreamsFn.Arn
                  - !GetAtt BackendAdminUpdateStreamFn.Arn
```

- [ ] **Step 6: Validate the template**

Run: `python3 -c "import yaml,sys; yaml.SafeLoader.add_multi_constructor('!', lambda l,s,n: None); yaml.safe_load(open('infra/main-stack/deployment.cfn.yaml'))" && echo OK`
Expected: `OK`. (The loader hook is needed because the template uses CloudFormation short tags like `!Ref` and `!Sub`.)

Then confirm all five edits landed:

```bash
grep -c "BackendAdminListStreamsFn\|BackendAdminUpdateStreamFn" infra/main-stack/deployment.cfn.yaml
grep -c "BackendAdminListStreamsRoute\|BackendAdminUpdateStreamRoute" infra/main-stack/deployment.cfn.yaml
```
Expected: `6` then `4`.

Six function-name lines: each function appears three times — its definition, its `IntegrationUri`, and its `BackendAPIRole` resource entry. Four route-name lines: each route appears twice — its definition and its `DependsOn` entry. A count of 4 on the first command means Step 5 (the API role) was missed; a count of 2 on the second means Step 4 (the `DependsOn` list) was missed. Both omissions deploy cleanly and fail at runtime, which is why they are checked explicitly.

- [ ] **Step 7: Commit**

```bash
git add infra/main-stack/deployment.cfn.yaml
git commit -m "feat: wire up admin stream routes"
```

---

### Task 6: Admin page

**Files:**
- Create: `frontend/src/admin.html`
- Create: `frontend/src/js/admin.ts`
- Create: `frontend/src/js/admin/fetchStreams.ts`
- Create: `frontend/src/js/admin/saveStream.ts`

**Interfaces:**
- Consumes: `GET /api/admin/streams` and `POST /api/admin/streams/{muxTokenId}` (Tasks 3, 4); `elm`/`appendChild` from `js/dom.ts`; `AccessDenied` from `js/helpers/AccessDenied.ts`; `Result` helpers from `js/helpers/result.ts`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the fetch module**

Create `frontend/src/js/admin/fetchStreams.ts`:

```typescript
import { nanoid } from 'nanoid';
import { Result, failure, success } from '../helpers/result';
import { AccessDenied } from '../helpers/AccessDenied';

export type AdminTags = Record<string, string>;

export interface AdminStream {
  id: string;
  tags: AdminTags;
}

export interface AdminStreams {
  streams: AdminStream[];
  demos: string[];
}

interface AdminStreamsResponseOk {
  ok: true;
  streams: AdminStream[];
  demos: string[];
}

interface AdminStreamsResponseError {
  ok: false;
  error: string;
}

export const fetchStreams = async (): Promise<Result<Error, AdminStreams>> => {
  try {
    const fetchResponse = await fetch(`/api/admin/streams?${nanoid()}`, { credentials: 'include' });

    const body = (await fetchResponse.json()) as AdminStreamsResponseOk | AdminStreamsResponseError;

    if (body.ok === false) {
      if (fetchResponse.status === 403) {
        throw new AccessDenied(body.error, fetchResponse.status);
      }
      throw new Error(body.error);
    }

    return success({ streams: body.streams, demos: body.demos });
  } catch (err) {
    return failure(err as Error);
  }
};
```

- [ ] **Step 2: Write the save module**

Create `frontend/src/js/admin/saveStream.ts`:

```typescript
import { Result, failure, success } from '../helpers/result';
import { AccessDenied } from '../helpers/AccessDenied';
import { AdminTags } from './fetchStreams';

export interface TagEdits {
  title?: string;
  // Omitted entirely when the field is blank. A stream with no multiview:order tag
  // is a supported state (getOrderFromTag defaults it), and sending '' would fail
  // validation on every save, even one that only changed the title.
  order?: string;
  show: boolean;
  demo: string | null;
}

export interface SavedStream {
  tags: AdminTags;
  refreshed: boolean;
}

interface SaveResponseOk {
  ok: true;
  refreshed: boolean;
  stream: { id: string; tags: AdminTags };
}

interface SaveResponseError {
  ok: false;
  error: string;
}

export const saveStream = async (id: string, edits: TagEdits): Promise<Result<Error, SavedStream>> => {
  try {
    const fetchResponse = await fetch(`/api/admin/streams/${encodeURIComponent(id)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edits),
    });

    const body = (await fetchResponse.json()) as SaveResponseOk | SaveResponseError;

    if (body.ok === false) {
      if (fetchResponse.status === 403) {
        throw new AccessDenied(body.error, fetchResponse.status);
      }
      throw new Error(body.error);
    }

    return success({ tags: body.stream.tags, refreshed: body.refreshed });
  } catch (err) {
    return failure(err as Error);
  }
};
```

`JSON.stringify` drops keys whose value is `undefined`, so an omitted `order` or `title` never reaches the backend and `parseTagEdits` leaves that tag alone.

- [ ] **Step 3: Write the page script**

Create `frontend/src/js/admin.ts`:

```typescript
import { appendChild, elm } from './dom';
import { AdminStream, fetchStreams } from './admin/fetchStreams';
import { saveStream } from './admin/saveStream';
import { AccessDenied } from './helpers/AccessDenied';
import { isFailure, successValue } from './helpers/result';

const TAG_TITLE = 'multiview:title';
const TAG_ORDER = 'multiview:order';
const TAG_SHOW = 'multiview:show';
const TAG_DEMO = 'multiview:demo';

const tr = elm('tr');
const td = elm('td');
const th = elm('th');
const table = elm('table');
const input = elm('input');
const select = elm('select');
const option = elm('option');
const button = elm('button');
const span = elm('span');

const CELL = 'px-2 py-2 align-middle';

const createRow = (stream: AdminStream, demos: string[]): HTMLTableRowElement => {
  const titleInput = input([], { type: 'text', class: 'border rounded px-2 py-1 w-64' });
  titleInput.value = stream.tags[TAG_TITLE] ?? '';

  const orderInput = input([], { type: 'number', class: 'border rounded px-2 py-1 w-20' });
  orderInput.value = stream.tags[TAG_ORDER] ?? '';

  const showInput = input([], { type: 'checkbox', class: 'w-4 h-4' });
  showInput.checked = stream.tags[TAG_SHOW] === 'true';

  const demoSelect = select(
    [option(['(none)'], { value: '' }), ...demos.map((demo) => option([demo], { value: demo }))],
    { class: 'border rounded px-2 py-1' },
  );
  demoSelect.value = stream.tags[TAG_DEMO] ?? '';

  const status = span([''], { class: 'text-sm text-gray-600' });

  const save = button(['Save'], { type: 'button', class: 'bg-blue-600 text-white rounded px-3 py-1' });

  save.addEventListener('click', () => {
    save.disabled = true;
    status.textContent = 'Saving…';

    void saveStream(stream.id, {
      title: titleInput.value,
      // Blank order means "no multiview:order tag", which is a valid state — send
      // nothing rather than '' so an untouched blank order cannot fail the save.
      order: orderInput.value === '' ? undefined : orderInput.value,
      show: showInput.checked,
      demo: demoSelect.value === '' ? null : demoSelect.value,
    }).then((result) => {
      save.disabled = false;

      if (isFailure(result)) {
        if (result.value instanceof AccessDenied) {
          window.location.href = '/access-denied.html';
          return;
        }
        status.textContent = `Failed: ${result.value.message}`;
        return;
      }

      const { tags, refreshed } = successValue(result);
      titleInput.value = tags[TAG_TITLE] ?? '';
      orderInput.value = tags[TAG_ORDER] ?? '';
      showInput.checked = tags[TAG_SHOW] === 'true';
      demoSelect.value = tags[TAG_DEMO] ?? '';
      status.textContent = refreshed
        ? `Saved ${new Date().toLocaleTimeString()}`
        : `Saved ${new Date().toLocaleTimeString()} — cache refresh failed, may take 60s`;
    });
  });

  return tr([
    td([stream.id], { class: `${CELL} font-mono text-sm` }),
    td([titleInput], { class: CELL }),
    td([orderInput], { class: CELL }),
    td([showInput], { class: `${CELL} text-center` }),
    td([demoSelect], { class: CELL }),
    td([save], { class: CELL }),
    td([status], { class: CELL }),
  ]);
};

const run = async () => {
  const root = document.getElementById('streams');
  const append = appendChild(root);

  const result = await fetchStreams();

  if (isFailure(result)) {
    if (result.value instanceof AccessDenied) {
      window.location.href = '/access-denied.html';
      return;
    }
    append(span([`Could not load streams: ${result.value.message}`], { class: 'text-red-700' }));
    return;
  }

  const { streams, demos } = successValue(result);

  append(
    table(
      [
        tr(
          ['Stream', 'Title', 'Order', 'Show', 'Demo', '', ''].map((label) =>
            th([label], { class: 'px-2 py-2 text-left text-sm font-semibold' }),
          ),
        ),
        ...streams.map((stream) => createRow(stream, demos)),
      ],
      { class: 'w-full border-collapse' },
    ),
  );
};

run().catch((err) => console.error('Failed somewhere', err));
```

- [ ] **Step 4: Write the page**

Create `frontend/src/admin.html`:

```html
<!doctype html>
<html>
  <head>
    <title>Stream Admin</title>

    <link href="css/attend.css" rel="stylesheet" />

    <script type="module" src="js/admin.ts"></script>
  </head>
  <body class="p-6">
    <h1 class="text-2xl font-semibold mb-1">Stream Admin</h1>
    <p class="text-sm text-gray-600 mb-6">
      Only works on <code>live.aws.nextdayvideo.com.au</code> — the monitor domain does not forward
      the login cookie. Each row saves on its own and refreshes the caches immediately.
    </p>

    <div id="streams"></div>
  </body>
</html>
```

- [ ] **Step 5: Verify**

Run from `frontend/`:
- `./node_modules/.bin/tsc --noEmit` — expected: no output.
- `./node_modules/.bin/prettier --check ./src/js/admin.ts ./src/js/admin/ ./src/admin.html` — expected: all files pass. If it reports changes, run the same command with `--write` and re-check.

Note: `frontend` is `strict: false`, so `appendChild(root)` on a possibly-null element typechecks. Do not add non-null assertions to satisfy a strictness setting this project does not use.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/admin.html frontend/src/js/admin.ts frontend/src/js/admin/
git commit -m "feat: add stream admin page"
```

---

### Task 7: End-to-end check — POST-MERGE, SOPHIE ONLY

> **Not for the implementing agent.** Every step below needs AWS credentials and deployed
> infrastructure. Agents must not attempt any of it, and must not report any of it as verified.
> Tasks 1–6 end at a pull request; this task starts after that PR is merged and
> `.github/workflows/main.yaml` has deployed.

There is no offline backend — `frontend/.proxyrc.js` proxies `/api` to **production**. So the admin
endpoints do not exist anywhere until the backend change is merged and deployed, and running the dev
server before then shows a load error on the page. That is expected, not a bug to chase.

**Files:** none — verification only.

- [ ] **Step 1: Get a fresh cookie**

Authenticate normally in a browser against `live.aws.nextdayvideo.com.au`, then visit `/api/devtoken` and copy the `cookie` value into `NDV_AUD_COOKIE` in the gitignored `frontend/.env`. Tokens expire, so this may need repeating.

- [ ] **Step 2: Run the dev server**

Run from `frontend/`: `./node_modules/.bin/parcel src/*.html`

Open `http://localhost:1234/admin.html`.

- [ ] **Step 3: Check the listing**

Expected: every parameter under `/multiview/mux/` appears, **including any with `multiview:show` unset or `false`** — that is the property that distinguishes this from `/api/stream`. The demo dropdown offers `(none)`, `offline` and `fake-stream`.

Note: this requires the backend to be deployed, since the proxy points at production. Until then, `/api/admin/streams` returns a 404 from API Gateway and the page shows a load error.

- [ ] **Step 4: Check a save round-trip**

Change a title, click Save. Expected: status shows "Saved <time>", and the new title is visible in the AWS console on the parameter's tags.

Then set a stream's demo to `offline` and confirm an open monitor tab reflects it without a reload — that exercises the stream-cache refresh and the Ably publish together, which is the part the plan cannot unit-test.

- [ ] **Step 5: Check the failure paths**

- Enter a non-integer order (e.g. `1.5`) and save. Expected: status shows "Failed: order must be a whole number", and the tag is unchanged.
- Clear a title and save. Expected: the `multiview:title` tag is removed from the parameter.
- Set demo back to `(none)`. Expected: the `multiview:demo` tag is removed.
- On a stream with **no** `multiview:order` tag (remove it in the console if none exists), change only the title and save. Expected: success. A `400 order must be a whole number` here means the blank-order omission in Task 6 Step 3 was dropped.
- Set a demo on a stream that is **not** currently live, then clear it and save. Expected: status shows "Saved … — cache refresh failed, may take 60s" or a plain "Saved", but never "Failed". The tags must be correct in the console either way. A "Failed" here means the non-fatal refresh handling in Task 4 Step 4 was dropped.

---

## Notes for the implementer

- Adding backend files changes the hash from `backend-lambda/ci/current-object.sh`, so the next push to `main` rebuilds and re-uploads the Lambda zip. That is expected, not a problem.
- The frontend deploys to a bucket shared by both distributions, so `admin.html` will also be reachable on the monitor domain, where every API call fails. The page says so in its header. Do not add infra to block it — the monitor distribution is deliberately left unauthenticated.
- If `ts-auto-guard` generates a guard for `AdminTagEditRequest` that rejects `demo: null`, check that `types.ts` declares `demo?: string | null` and not `demo?: string`. The null case is how the UI clears the tag.
