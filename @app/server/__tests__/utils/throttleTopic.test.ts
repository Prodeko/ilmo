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
