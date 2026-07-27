declare module '@esm2cjs/p-queue' {
  type Task<TaskResultType> =
    | (() => PromiseLike<TaskResultType>)
    | (() => TaskResultType);

  interface Options {
    concurrency?: number;
    autoStart?: boolean;
    timeout?: number;
    throwOnTimeout?: boolean;
    intervalCap?: number;
    interval?: number;
    carryoverConcurrencyCount?: boolean;
  }

  class PQueue {
    constructor(options?: Options);
    add<TaskResultType>(
      fn: Task<TaskResultType>,
      options?: { priority?: number; signal?: AbortSignal },
    ): Promise<TaskResultType | void>;
    readonly size: number;
    readonly pending: number;
    readonly isPaused: boolean;
    pause(): void;
    start(): this;
    clear(): void;
    onEmpty(): Promise<void>;
    onIdle(): Promise<void>;
    onSizeLessThan(limit: number): Promise<void>;
  }

  export default PQueue;
}
