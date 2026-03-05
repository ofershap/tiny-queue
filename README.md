# tiny-queue

[![npm version](https://img.shields.io/npm/v/queue-tiny.svg)](https://www.npmjs.com/package/queue-tiny)
[![npm downloads](https://img.shields.io/npm/dm/queue-tiny.svg)](https://www.npmjs.com/package/queue-tiny)
[![CI](https://github.com/ofershap/tiny-queue/actions/workflows/ci.yml/badge.svg)](https://github.com/ofershap/tiny-queue/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Promise queue with concurrency control. Same API as [`p-queue`](https://github.com/sindresorhus/p-queue), but ships both ESM and CJS with zero dependencies.

```ts
import { PQueue } from "queue-tiny";

const queue = new PQueue({ concurrency: 5 });
await queue.add(() => fetch(url));
await queue.onIdle();
```

> ~3.2 KB gzipped. Zero dependencies. Priority support, pause/resume, events, timeouts.

![Demo](assets/demo.gif)

<sub>Demo built with <a href="https://github.com/ofershap/remotion-readme-kit">remotion-readme-kit</a></sub>

## Install

```bash
npm install queue-tiny
```

## Usage

```ts
import { PQueue } from "queue-tiny";

const queue = new PQueue({ concurrency: 3 });

const result = await queue.add(() => fetchUser(1));
const batch = await queue.addAll([
  () => fetchUser(2),
  () => fetchUser(3),
  () => fetchUser(4),
]);

await queue.onIdle();
```

### Priority tasks

```ts
const queue = new PQueue({ concurrency: 1 });

queue.add(lowPriorityWork, { priority: 0 });
queue.add(highPriorityWork, { priority: 10 }); // runs first
```

### Pause and resume

```ts
queue.pause();
queue.add(() => doWork()); // queued but won't run

queue.start(); // now it runs
await queue.onIdle();
```

### Timeouts

```ts
const queue = new PQueue({
  concurrency: 2,
  timeout: 5000,
  throwOnTimeout: true,
});

// throws if task takes longer than 5 seconds
await queue.add(() => slowOperation());
```

### Events

```ts
queue.on("active", () => console.log(`Running: ${queue.pending}`));
queue.on("idle", () => console.log("All done"));
queue.on("error", (err) => console.error(err));
```

### Wait for queue state

```ts
await queue.onEmpty(); // queue drained (tasks may still run)
await queue.onIdle(); // everything finished
await queue.onSizeLessThan(5); // queue drops below 5
```

## Differences from `p-queue`

`p-queue` v8+ is ESM-only. If you `require("p-queue")` in a CommonJS project, you get `ERR_REQUIRE_ESM`. `tiny-queue` works with both `import` and `require()`.

|              | `p-queue`                    | `tiny-queue` |
| ------------ | ---------------------------- | ------------ |
| CJS support  | v6 only (v7+ ESM-only)       | ESM + CJS    |
| Dependencies | `eventemitter3`, `p-timeout` | 0            |
| TypeScript   | separate @types              | native       |
| Export       | default                      | named        |

## Migrating from p-queue

```diff
- import PQueue from "p-queue";
+ import { PQueue } from "queue-tiny";
```

One line. Everything else stays the same.

## API

### `new PQueue(options?)`

- `concurrency` - max parallel tasks (default: `Infinity`)
- `autoStart` - start processing immediately (default: `true`)
- `timeout` - per-task timeout in ms
- `throwOnTimeout` - throw on timeout instead of resolving undefined (default: `false`)

### `queue.add(fn, options?)`

Add a task. Returns a promise with the result. Options: `priority` (higher = sooner, default 0), `signal` (AbortSignal).

### `queue.addAll(fns, options?)`

Add multiple tasks. Returns `Promise<T[]>`.

### `queue.pause()` / `queue.start()`

Pause or resume processing.

### `queue.clear()`

Remove all pending tasks.

### `queue.onIdle()` / `queue.onEmpty()` / `queue.onSizeLessThan(n)`

Wait for queue state changes.

### `queue.on(event, listener)` / `queue.off(event, listener)`

Events: `active`, `idle`, `add`, `next`, `completed`, `error`.

### `queue.size` / `queue.pending` / `queue.isPaused` / `queue.concurrency`

Inspect and control the queue at runtime.

## The tiny-\* family

Drop-in replacements for sindresorhus async utilities. All ship ESM + CJS with zero dependencies.

| Package                                                | Replaces             | What it does                   |
| ------------------------------------------------------ | -------------------- | ------------------------------ |
| [tiny-limit](https://github.com/ofershap/tiny-limit)   | p-limit              | Concurrency limiter            |
| [tiny-map](https://github.com/ofershap/tiny-map)       | p-map                | Concurrent map with order      |
| [tiny-retry](https://github.com/ofershap/tiny-retry)   | p-retry              | Retry with exponential backoff |
| **tiny-queue**                                         | p-queue              | Priority task queue            |
| [tiny-ms](https://github.com/ofershap/tiny-ms)         | ms                   | Parse/format durations         |
| [tiny-escape](https://github.com/ofershap/tiny-escape) | escape-string-regexp | Escape regex chars             |

Want all async utilities in one import? Use [`tiny-async-kit`](https://github.com/ofershap/tiny-async).

## Author

[![Made by ofershap](https://gitshow.dev/api/card/ofershap)](https://gitshow.dev/ofershap)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=flat&logo=linkedin&logoColor=white)](https://linkedin.com/in/ofershap)
[![GitHub](https://img.shields.io/badge/GitHub-Follow-181717?style=flat&logo=github&logoColor=white)](https://github.com/ofershap)

---

If this saved you from `ERR_REQUIRE_ESM`, [star the repo](https://github.com/ofershap/tiny-queue) or [open an issue](https://github.com/ofershap/tiny-queue/issues) if something breaks.

## License

[MIT](LICENSE) &copy; [Ofer Shapira](https://github.com/ofershap)
