# SDK

`packages/sdk` exposes two entry points from its index:

```ts
export { VaultMindClient } from './client';
export { createPolicyHelper, type PolicyHelper } from './policy-helper';
```

## `VaultMindClient`

Wraps the policy engine and the audit database directly, with no server involved.

| Method | Returns | Notes |
| --- | --- | --- |
| `startSession(id?)` | `Promise<string>` | Opens a session, generating an id when one is not supplied. |
| `getEvents(limit = 100)` | `Record<string, unknown>[]` | Most recent events for the current session. |
| `getStats()` | `{ total, allowed, denied, errors }` | Verdict counts. |
| `endSession()` | `Promise<void>` | Closes the session and flushes state. |
| `getPolicy()` | `PolicyConfig` | The active policy. |
| `setPolicy(policy)` | `void` | Replaces the active policy. |
| `close()` | `void` | Releases the database handle. |

## `createPolicyHelper`

A fluent builder for policies, which avoids hand-writing YAML:

```ts
import { createPolicyHelper } from '@vaultmind/sdk';

const policy = createPolicyHelper()
  .allow('read(docs/*)')
  .deny('write(src/*)')
  .network('off')
  .build();
```

`setPolicy` accepts the result, so a helper-built policy can be applied to a live client
without a round trip through disk.