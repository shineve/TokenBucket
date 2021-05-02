import { TokenBucket } from './TokenBucket';
import { wait } from './wait';

describe('TokenBucket', () => {
  describe('bucket size 100, 10 tokens per 100ms, max wait time 200ms', () => {
    it('initialized with full bucket', () => {
      const bucket = new TokenBucket({
        bucketSize: 100,
        tokensPerInterval: 10,
        interval: 100,
        maxWait: 200,
      });
      expect(bucket.bucketSize).toEqual(100);
      expect(bucket.tokensPerInterval).toEqual(10);
      expect(bucket.tokens).toEqual(bucket.bucketSize);
    });

    it('burst limit equal to bucketSize', async () => {
      const bucket = new TokenBucket({
        bucketSize: 100,
        tokensPerInterval: 10,
        interval: 100,
        maxWait: 200,
      });
      expect(bucket.tryRemoveTokens(1000)).toEqual(false);
      expect(bucket.tryRemoveTokens(100)).toEqual(true);
    });

    it('tokens size not greather than bucket size', async () => {
      const bucket = new TokenBucket({
        bucketSize: 100,
        tokensPerInterval: 10,
        interval: 100,
        maxWait: 200,
      });
      await bucket.removeTokens(100);
      await wait(1500);
      expect(bucket.remainingTokens).toEqual(100);
    });

    it('removing 10 tokens wont exceed maxWait 100ms', async () => {
      const bucket = new TokenBucket({
        bucketSize: 100,
        tokensPerInterval: 10,
        interval: 100,
        maxWait: 100,
      });
      // empty bucket
      await bucket.removeTokens(100);
      const remainingTokens = await bucket.removeTokens(10);
      expect(remainingTokens).toBeLessThan(10);
    });
  });

  describe('bucket size 100, 10 tokens per second, max wait time 1 second', () => {
    it('20 tokens refilled after 2 seconds', async () => {
      const bucket = new TokenBucket({
        bucketSize: 100,
        tokensPerInterval: 10,
        interval: 'second',
        maxWait: 'second',
      });
      // empty bucket
      await bucket.removeTokens(100);
      await wait(2000);
      expect(bucket.remainingTokens).toEqual(20);
    });
  });
});
