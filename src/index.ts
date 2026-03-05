export interface QueueOptions {
  concurrency?: number;
  autoStart?: boolean;
  timeout?: number | undefined;
  throwOnTimeout?: boolean | undefined;
}

export interface AddOptions {
  priority?: number;
  signal?: AbortSignal | undefined;
}

type EventName = "active" | "idle" | "add" | "next" | "completed" | "error";
type Listener = (...args: unknown[]) => void;

interface QueueItem {
  fn: () => Promise<unknown>;
  priority: number;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal | undefined;
}

export class PQueue {
  private _concurrency: number;
  private _timeout: number | undefined;
  private _throwOnTimeout: boolean;
  private _isPaused: boolean;
  private _pending = 0;
  private _queue: QueueItem[] = [];
  private _listeners = new Map<string, Set<Listener>>();
  private _idleResolvers: (() => void)[] = [];
  private _emptyResolvers: (() => void)[] = [];
  private _sizeLessThanResolvers: { limit: number; resolve: () => void }[] = [];

  constructor(options?: QueueOptions) {
    const {
      concurrency = Infinity,
      autoStart = true,
      timeout,
      throwOnTimeout = false,
    } = options ?? {};

    validateConcurrency(concurrency);
    this._concurrency = concurrency;
    this._isPaused = !autoStart;
    this._timeout = timeout;
    this._throwOnTimeout = throwOnTimeout;
  }

  add<T>(fn: () => Promise<T> | T, options?: AddOptions): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const priority = options?.priority ?? 0;
      const signal = options?.signal;

      if (signal?.aborted) {
        reject(signal.reason ?? new Error("Aborted"));
        return;
      }

      const item: QueueItem = {
        fn: fn as () => Promise<unknown>,
        priority,
        resolve: resolve as (v: unknown) => void,
        reject,
        signal,
      };

      this._insertSorted(item);
      this._emit("add");
      this._checkSizeLessThan();
      this._tryRun();
    });
  }

  addAll<T>(fns: (() => Promise<T> | T)[], options?: AddOptions): Promise<T[]> {
    return Promise.all(fns.map((fn) => this.add(fn, options)));
  }

  start(): this {
    this._isPaused = false;
    this._processQueue();
    return this;
  }

  pause(): void {
    this._isPaused = true;
  }

  clear(): void {
    this._queue.length = 0;
    this._checkSizeLessThan();
  }

  async onIdle(): Promise<void> {
    if (this._pending === 0 && this._queue.length === 0) return;
    return new Promise<void>((resolve) => {
      this._idleResolvers.push(resolve);
    });
  }

  async onEmpty(): Promise<void> {
    if (this._queue.length === 0) return;
    return new Promise<void>((resolve) => {
      this._emptyResolvers.push(resolve);
    });
  }

  async onSizeLessThan(limit: number): Promise<void> {
    if (this._queue.length < limit) return;
    return new Promise<void>((resolve) => {
      this._sizeLessThanResolvers.push({ limit, resolve });
    });
  }

  on(event: EventName, listener: Listener): void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
  }

  off(event: string, listener: Listener): void {
    this._listeners.get(event)?.delete(listener);
  }

  get size(): number {
    return this._queue.length;
  }

  get pending(): number {
    return this._pending;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  get concurrency(): number {
    return this._concurrency;
  }

  set concurrency(value: number) {
    validateConcurrency(value);
    this._concurrency = value;
    this._processQueue();
  }

  private _insertSorted(item: QueueItem): void {
    let low = 0;
    let high = this._queue.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if ((this._queue[mid] as QueueItem).priority >= item.priority) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this._queue.splice(low, 0, item);
  }

  private _tryRun(): void {
    if (this._isPaused) return;
    this._processQueue();
  }

  private _processQueue(): void {
    while (
      this._pending < this._concurrency &&
      this._queue.length > 0 &&
      !this._isPaused
    ) {
      const item = this._queue.shift() as QueueItem;
      this._runItem(item);
      this._checkEmpty();
      this._checkSizeLessThan();
    }
  }

  private _runItem(item: QueueItem): void {
    this._pending++;
    this._emit("active");

    if (item.signal?.aborted) {
      this._pending--;
      item.reject(item.signal.reason ?? new Error("Aborted"));
      this._emit("next");
      this._checkIdle();
      this._tryRun();
      return;
    }

    let taskPromise = Promise.resolve().then(() => item.fn());

    if (this._timeout !== undefined) {
      taskPromise = this._withTimeout(taskPromise, this._timeout);
    }

    taskPromise
      .then(
        (result) => {
          item.resolve(result);
          this._emit("completed", result);
        },
        (error: unknown) => {
          item.reject(error);
          this._emit("error", error);
        },
      )
      .finally(() => {
        this._pending--;
        this._emit("next");
        this._checkIdle();
        this._tryRun();
      });
  }

  private _withTimeout(
    promise: Promise<unknown>,
    ms: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this._throwOnTimeout) {
          reject(new Error(`Promise timed out after ${ms} milliseconds`));
        } else {
          resolve(undefined);
        }
      }, ms);

      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  private _emit(event: string, ...args: unknown[]): void {
    const set = this._listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(...args);
      }
    }
  }

  private _checkIdle(): void {
    if (this._pending === 0 && this._queue.length === 0) {
      this._emit("idle");
      for (const resolve of this._idleResolvers) resolve();
      this._idleResolvers.length = 0;
    }
  }

  private _checkEmpty(): void {
    if (this._queue.length === 0) {
      for (const resolve of this._emptyResolvers) resolve();
      this._emptyResolvers.length = 0;
    }
  }

  private _checkSizeLessThan(): void {
    const remaining: { limit: number; resolve: () => void }[] = [];
    for (const entry of this._sizeLessThanResolvers) {
      if (this._queue.length < entry.limit) {
        entry.resolve();
      } else {
        remaining.push(entry);
      }
    }
    this._sizeLessThanResolvers = remaining;
  }
}

export default PQueue;

function validateConcurrency(value: number): void {
  if (
    !(
      (Number.isInteger(value) || value === Number.POSITIVE_INFINITY) &&
      value > 0
    )
  ) {
    throw new TypeError("Expected `concurrency` to be a number from 1 and up");
  }
}
