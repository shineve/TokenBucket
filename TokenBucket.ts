import { wait } from './wait';

export type Interval = number | 'second' | 'minute' | 'hour' | 'day';

export class TokenBucket {
  bucketSize: number;
  tokensPerInterval: number;
  interval: number;
  tokens: number;
  lastRefillTimestamp: number;
  maxWait: Interval;

  constructor({ bucketSize, tokensPerInterval, interval, maxWait }) {
    this.bucketSize = bucketSize;
    this.tokens = bucketSize;
    this.tokensPerInterval = tokensPerInterval;

    if (typeof interval === 'string') {
      switch (interval) {
        case 'second':
          this.interval = 1000;
          break;
        case 'minute':
          this.interval = 1000 * 60;
          this.maxWait = 1000 * 60;
          break;
        case 'hour':
          this.interval = 1000 * 60 * 60;
          this.maxWait = 1000 * 60 * 60;
          break;
        case 'day':
          this.interval = 1000 * 60 * 60 * 24;
          this.maxWait = 1000 * 60 * 60 * 24;
          break;
        default:
          throw new Error(`Invalid interval: ${interval}, Invalid maxWait: ${maxWait}`);
      }
    } else {
      this.interval = interval;
      this.maxWait = maxWait;
    }

    this.lastRefillTimestamp = Date.now();
  }

  get remainingTokens(): number {
    this.refillTokens();
    return this.tokens;
  }

  tryRemoveTokens(count: number): boolean {
    if (count > this.bucketSize) return false;

    this.refillTokens();

    if (count > this.tokens) return false;

    return true;
  }

  removeTokens(count: number): Promise<number> | number {
    if (count > this.bucketSize) {
      throw new Error('ExceedsBucketSize');
    }

    this.refillTokens();

    const retryLater = async () => {
      const waitMs = Math.ceil((count - this.tokens) * (this.interval / this.tokensPerInterval));

      if (waitMs > this.maxWait) {
        throw new Error('ExceedsMaxWait');
      }

      await wait(waitMs);
      return this.removeTokens(count);
    };

    if (count > this.tokens) return retryLater();

    this.tokens -= count;
    return this.tokens;
  }

  refillTokens(): boolean {
    const now = Date.now();
    const deltaMS = Math.max(now - this.lastRefillTimestamp, 0);
    this.lastRefillTimestamp = now;

    const refillAmount = Math.floor(deltaMS * (this.tokensPerInterval / this.interval));
    const prevContent = this.tokens;
    this.tokens = Math.min(this.tokens + refillAmount, this.bucketSize);
    return Math.floor(this.tokens) > Math.floor(prevContent);
  }
}
