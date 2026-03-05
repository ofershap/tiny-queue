import { describe, it, expect } from "vitest";
import { PQueue } from "../src/index.js";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("PQueue", () => {
  it("runs tasks", async () => {
    const queue = new PQueue({ concurrency: 1 });
    const result = await queue.add(() => 42);
    expect(result).toBe(42);
  });

  it("limits concurrency", async () => {
    const queue = new PQueue({ concurrency: 2 });
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await delay(20);
      running--;
    };

    await Promise.all(Array.from({ length: 6 }, () => queue.add(task)));
    expect(maxRunning).toBe(2);
  });

  it("respects priority ordering", async () => {
    const queue = new PQueue({ concurrency: 1 });
    const order: number[] = [];

    const blocker = queue.add(() => delay(30));

    queue.add(
      async () => {
        order.push(1);
      },
      { priority: 1 },
    );
    queue.add(
      async () => {
        order.push(10);
      },
      { priority: 10 },
    );
    queue.add(
      async () => {
        order.push(5);
      },
      { priority: 5 },
    );

    await blocker;
    await queue.onIdle();

    expect(order).toEqual([10, 5, 1]);
  });

  it("supports pause and start", async () => {
    const queue = new PQueue({ concurrency: 1 });
    const order: number[] = [];

    queue.pause();
    expect(queue.isPaused).toBe(true);

    queue.add(async () => order.push(1));
    queue.add(async () => order.push(2));

    expect(order).toEqual([]);

    queue.start();
    await queue.onIdle();

    expect(order).toEqual([1, 2]);
    expect(queue.isPaused).toBe(false);
  });

  it("supports autoStart false", async () => {
    const queue = new PQueue({ concurrency: 1, autoStart: false });
    const order: number[] = [];

    queue.add(async () => order.push(1));
    queue.add(async () => order.push(2));

    expect(order).toEqual([]);
    expect(queue.size).toBe(2);

    queue.start();
    await queue.onIdle();

    expect(order).toEqual([1, 2]);
  });

  it("clear removes pending tasks", async () => {
    const queue = new PQueue({ concurrency: 1 });
    const results: number[] = [];

    const blocker = queue.add(() => delay(30));
    queue.add(async () => results.push(2));
    queue.add(async () => results.push(3));

    expect(queue.size).toBe(2);
    queue.clear();
    expect(queue.size).toBe(0);

    await blocker;
    await queue.onIdle();
    expect(results).toEqual([]);
  });

  it("onIdle resolves when all done", async () => {
    const queue = new PQueue({ concurrency: 2 });

    queue.add(() => delay(20));
    queue.add(() => delay(30));

    await queue.onIdle();

    expect(queue.pending).toBe(0);
    expect(queue.size).toBe(0);
  });

  it("onIdle resolves immediately if already idle", async () => {
    const queue = new PQueue({ concurrency: 1 });
    await queue.onIdle();
  });

  it("onEmpty resolves when queue is empty", async () => {
    const queue = new PQueue({ concurrency: 1 });

    queue.add(() => delay(20));
    queue.add(() => delay(20));

    await queue.onEmpty();
    expect(queue.size).toBe(0);
  });

  it("onEmpty resolves immediately if already empty", async () => {
    const queue = new PQueue({ concurrency: 1 });
    await queue.onEmpty();
  });

  it("onSizeLessThan resolves", async () => {
    const queue = new PQueue({ concurrency: 1 });

    queue.add(() => delay(10));
    queue.add(() => delay(10));
    queue.add(() => delay(10));

    await queue.onSizeLessThan(3);
    expect(queue.size).toBeLessThan(3);
  });

  it("addAll adds multiple tasks", async () => {
    const queue = new PQueue({ concurrency: 2 });
    const results = await queue.addAll([() => 1, () => 2, () => 3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it("timeout resolves undefined by default", async () => {
    const queue = new PQueue({ concurrency: 1, timeout: 10 });
    const result = await queue.add(() => delay(100).then(() => "late"));
    expect(result).toBeUndefined();
  });

  it("timeout throws when throwOnTimeout is true", async () => {
    const queue = new PQueue({
      concurrency: 1,
      timeout: 10,
      throwOnTimeout: true,
    });
    await expect(
      queue.add(() => delay(100).then(() => "late")),
    ).rejects.toThrow("timed out");
  });

  it("emits events", async () => {
    const queue = new PQueue({ concurrency: 1 });
    const events: string[] = [];

    queue.on("active", () => events.push("active"));
    queue.on("idle", () => events.push("idle"));
    queue.on("add", () => events.push("add"));
    queue.on("next", () => events.push("next"));
    queue.on("completed", () => events.push("completed"));

    await queue.add(() => "ok");
    await queue.onIdle();

    expect(events).toContain("active");
    expect(events).toContain("idle");
    expect(events).toContain("add");
    expect(events).toContain("next");
    expect(events).toContain("completed");
  });

  it("emits error event", async () => {
    const queue = new PQueue({ concurrency: 1 });
    const errors: unknown[] = [];

    queue.on("error", (err) => errors.push(err));

    try {
      await queue.add(() => {
        throw new Error("boom");
      });
    } catch {
      // expected
    }

    expect(errors).toHaveLength(1);
  });

  it("off removes listener", async () => {
    const queue = new PQueue({ concurrency: 1 });
    let count = 0;
    const listener = () => count++;

    queue.on("add", listener);
    queue.add(() => "ok");
    expect(count).toBe(1);

    queue.off("add", listener);
    queue.add(() => "ok2");
    expect(count).toBe(1);
    await queue.onIdle();
  });

  it("size and pending getters", async () => {
    const queue = new PQueue({ concurrency: 1 });

    const blocker = queue.add(() => delay(30));
    queue.add(() => delay(10));

    expect(queue.pending).toBe(1);
    expect(queue.size).toBe(1);

    await blocker;
    await queue.onIdle();

    expect(queue.pending).toBe(0);
    expect(queue.size).toBe(0);
  });

  it("dynamic concurrency change", async () => {
    const queue = new PQueue({ concurrency: 1 });
    expect(queue.concurrency).toBe(1);
    queue.concurrency = 5;
    expect(queue.concurrency).toBe(5);
  });

  it("rejects aborted signal before start", async () => {
    const queue = new PQueue({ concurrency: 1 });
    const controller = new AbortController();
    controller.abort();

    await expect(
      queue.add(() => "ok", { signal: controller.signal }),
    ).rejects.toThrow();
  });

  it("throws on invalid concurrency", () => {
    expect(() => new PQueue({ concurrency: 0 })).toThrow(TypeError);
    expect(() => new PQueue({ concurrency: -1 })).toThrow(TypeError);
  });
});
