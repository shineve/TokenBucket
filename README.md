# Token Bucket Algorithm

Token Bucket Algorithm 是在實現 [rate limiting](https://www.cloudflare.com/zh-tw/learning/bots/what-is-rate-limiting/)  時常用的一種算法，主要目的是控制發送到伺服器上的請求數量，並且允許突發的大量請求。研究 [Amazon API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html) 的說明文件，可以發現 Amazon API Gateway 也是透過這個算法來實現的。

## 概述

Token Bucket Algorithm 的原理並不困難，原理是我們會有一個 bucket，並且系統會以固定的速度往 bucket 內放入 token，如果 bucket 的容量滿時就不會再放入 token。

每當新請求進來需要被處理時，會先檢查 bucket 內是否還有 token，如果 token 不足的話則拒絕服務或排隊等待。

## 圖示

![https://i.imgur.com/G4zKDCI.png](https://i.imgur.com/G4zKDCI.png)

## 規則

1. 每 1/r 秒新增一個 token 到 bucket 中。
2. bucket 中最多可容納 x 個 token，如果 bucket 已滿，則暫停新增 token。
3. 當剩餘的 token 數量大於請求所需數量時，則消耗相對應數量的token。
4. 當剩餘的 token 數量小於請求所需數量時，則不會消耗任何 token，並拒絕本次請求或排隊等待。

## 實現方法

一般上有兩種實現方法

1. Timer thread
    - 後端撰寫工作排程，每 1/r 秒將 bucket 中的 token 數量加一，直到達到 bucket 容量。
    - 在請求發生時，計算 bucket 中是否有足夠的 token 來完成請求。
2. Timer-Free
    - 在請求發生時，按照速率來計算當次請求與上次請求之間應會產生多少個 token，並將 token 加上上次剩餘的 token 數量，當然不能超過 bucket 容量。
    - 在補充完 token 之後再計算是否有足夠的 token 來完成請求。

## 代碼

初始化

```tsx
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
}
```

### **補充 token**

這邊是使用 Timer-Free 的方式來實現

```tsx
refillTokens(): boolean {
    const now = Date.now();
    const duration = Math.max(now - this.lastRefillTimestamp, 0);
    this.lastRefillTimestamp = now;

    const refillAmount = Math.floor(duration * (this.tokensPerInterval / this.interval));
    const prevTokens = this.tokens;
    this.tokens = Math.min(this.tokens + refillAmount, this.bucketSize);
    return this.tokens > prevTokens;
  }
```

### 處理請求

**拒絕服務**

當請求所需的 token 數量超過 bucket 內的 token 數量時，拒絕服務。

```tsx
removeTokens(count: number): Promise<number> | number {
    if (count > this.bucketSize) {
      throw new Error('ExceedsBucketSize');
    }

    this.refillTokens();

    if (count > this.tokens) {
      throw new Error('TooManyRequests');
    }

    this.tokens -= count;
    return this.tokens;
  }
```

**排隊等待**

當請求所需的 token 數量超過 bucket 內的 token 數量時，但沒有超過 bucket 容量及最長等待時間(maxWait)時，我們可以讓請求排隊並延遲處理。

```tsx
removeTokens(count: number): number {
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
```
