import { PubSub } from "graphql-subscriptions"

import { throttledTopic } from "../../src/utils/throttleTopic"

const SOURCE = "graphql:eventRegistrations:6c568ce8-2ee9-442a-b5d3-83454279e308"

describe("throttledTopic", () => {
  let pubsub: PubSub
  let received: unknown[]

  beforeEach(async () => {
    jest.useFakeTimers()
    pubsub = new PubSub()
    received = []
    const topic = throttledTopic(pubsub, SOURCE, 1000)
    await pubsub.subscribe(topic, (payload) => received.push(payload))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("delivers the first message at once and the last one at the end of the window", () => {
    for (let i = 1; i <= 50; i++) {
      pubsub.publish(SOURCE, { event: "registrationUpdated", subject: i })
      jest.advanceTimersByTime(2)
    }
    expect(received).toEqual([{ event: "registrationUpdated", subject: 1 }])

    jest.advanceTimersByTime(1000)
    expect(received).toEqual([
      { event: "registrationUpdated", subject: 1 },
      { event: "registrationUpdated", subject: 50 },
    ])

    jest.advanceTimersByTime(5000)
    expect(received).toHaveLength(2)
  })

  it("delivers a message after a quiet period at once", () => {
    pubsub.publish(SOURCE, { subject: "first" })
    jest.advanceTimersByTime(1500)
    pubsub.publish(SOURCE, { subject: "second" })

    expect(received).toEqual([{ subject: "first" }, { subject: "second" }])
  })

  it("delivers again after the window that flushed the last message", () => {
    pubsub.publish(SOURCE, { subject: "first" })
    pubsub.publish(SOURCE, { subject: "trailing" })
    jest.advanceTimersByTime(1000)
    expect(received).toEqual([{ subject: "first" }, { subject: "trailing" }])

    jest.advanceTimersByTime(1000)
    pubsub.publish(SOURCE, { subject: "next" })
    expect(received).toEqual([
      { subject: "first" },
      { subject: "trailing" },
      { subject: "next" },
    ])
  })

  it("delivers a steady stream once per interval, ending with the last message", () => {
    let i = 0
    for (let t = 0; t < 3500; t += 100) {
      pubsub.publish(SOURCE, { subject: ++i })
      jest.advanceTimersByTime(100)
    }
    jest.advanceTimersByTime(1000)

    // Immediately at 0 ms, at the ends of the windows at 1000, 2000 and
    // 3000 ms, and the trailing message at 4000 ms.
    expect(received).toHaveLength(5)
    expect(received[received.length - 1]).toEqual({ subject: i })
  })

  it("throttles each source topic independently", async () => {
    const other = "graphql:eventRegistrations:other"
    const receivedOther: unknown[] = []
    await pubsub.subscribe(throttledTopic(pubsub, other, 1000), (payload) =>
      receivedOther.push(payload)
    )

    pubsub.publish(SOURCE, { subject: "a1" })
    pubsub.publish(other, { subject: "b1" })
    pubsub.publish(SOURCE, { subject: "a2" })
    expect(received).toEqual([{ subject: "a1" }])
    expect(receivedOther).toEqual([{ subject: "b1" }])

    jest.advanceTimersByTime(1000)
    expect(received).toEqual([{ subject: "a1" }, { subject: "a2" }])
    expect(receivedOther).toEqual([{ subject: "b1" }])
  })

  describe("when publishing fails", () => {
    let consoleError: jest.SpyInstance

    beforeEach(() => {
      consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
    })

    afterEach(() => {
      consoleError.mockRestore()
    })

    it("keeps relaying after a listener throws", async () => {
      const source = "graphql:eventRegistrations:throwing"
      const delivered: unknown[] = []
      let calls = 0
      await pubsub.subscribe(
        throttledTopic(pubsub, source, 1000),
        (payload) => {
          calls++
          if (calls === 1) {
            throw new Error("listener failed")
          }
          delivered.push(payload)
        }
      )

      pubsub.publish(source, { subject: "first" })
      pubsub.publish(source, { subject: "trailing" })
      jest.advanceTimersByTime(1000)
      jest.advanceTimersByTime(1000)
      pubsub.publish(source, { subject: "next" })

      expect(delivered).toEqual([{ subject: "trailing" }, { subject: "next" }])
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(source),
        expect.objectContaining({ message: "listener failed" })
      )
    })

    it("keeps relaying after a publish rejects", async () => {
      const source = "graphql:eventRegistrations:rejecting"
      const listeners = new Map<string, (payload: unknown) => void>()
      const published: unknown[] = []
      const failingPubSub = {
        publish(topic: string, payload: unknown) {
          if (topic === source) {
            listeners.get(source)(payload)
            return Promise.resolve()
          }
          published.push(payload)
          return Promise.reject(new Error("publish failed"))
        },
        subscribe(topic: string, onMessage: (payload: unknown) => void) {
          listeners.set(topic, onMessage)
        },
      }
      throttledTopic(failingPubSub, source, 1000)

      failingPubSub.publish(source, { subject: "first" })
      failingPubSub.publish(source, { subject: "trailing" })
      jest.advanceTimersByTime(2000)
      failingPubSub.publish(source, { subject: "next" })
      await Promise.resolve()

      expect(published).toEqual([
        { subject: "first" },
        { subject: "trailing" },
        { subject: "next" },
      ])
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(source),
        expect.objectContaining({ message: "publish failed" })
      )
    })
  })

  it("relays each source topic once", () => {
    const listeners = () =>
      (
        pubsub as unknown as { ee: { listenerCount(n: string): number } }
      ).ee.listenerCount(SOURCE)

    expect(listeners()).toEqual(1)
    expect(throttledTopic(pubsub, SOURCE, 1000)).toEqual(
      throttledTopic(pubsub, SOURCE, 1000)
    )
    expect(listeners()).toEqual(1)
  })

  it("names the throttled topic within Postgres' 63 character channel limit", () => {
    const topic = throttledTopic(pubsub, SOURCE, 1000)
    expect(topic).not.toEqual(SOURCE)
    expect(topic.length).toBeLessThanOrEqual(63)
  })
})
