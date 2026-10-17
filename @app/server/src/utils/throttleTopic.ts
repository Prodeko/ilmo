import { createHash } from "node:crypto"

/*
 * The slice of a graphql-subscriptions PubSubEngine the relay uses. With
 * @graphile/pg-pubsub, subscribing to a topic LISTENs on the Postgres channel
 * of the same name using its single shared listening connection.
 */
export interface RelayPubSub {
  publish(topic: string, payload: any): unknown
  subscribe(topic: string, onMessage: (payload: any) => void): unknown
}

const relays = new WeakMap<RelayPubSub, Map<string, string>>()

/*
 * Postgres truncates channel names to 63 characters, and @graphile/pg-pubsub
 * LISTENs on every topic subscribed through it, so the throttled topic gets a
 * short name of its own that cannot collide with a real channel.
 */
function throttledTopicName(sourceTopic: string): string {
  const digest = createHash("sha1").update(sourceTopic).digest("hex")
  return `throttled:${digest}`
}

/**
 * Relays `sourceTopic` to a throttled topic that publishes at most once per
 * `intervalMs`: the first message of a burst goes out immediately and the last
 * message received during the window goes out when the window ends. Returns the
 * throttled topic's name. The relay is created on the first call for a source
 * topic and shared by later calls.
 */
export function throttledTopic(
  pubsub: RelayPubSub,
  sourceTopic: string,
  intervalMs: number
): string {
  let topics = relays.get(pubsub)
  if (!topics) {
    topics = new Map()
    relays.set(pubsub, topics)
  }
  const existing = topics.get(sourceTopic)
  if (existing) {
    return existing
  }

  const topic = throttledTopicName(sourceTopic)
  topics.set(sourceTopic, topic)

  let windowOpen = false
  let hasPending = false
  let pending: unknown

  const closeWindow = () => {
    if (hasPending) {
      const payload = pending
      hasPending = false
      pending = undefined
      pubsub.publish(topic, payload)
      setTimeout(closeWindow, intervalMs)
    } else {
      windowOpen = false
    }
  }

  pubsub.subscribe(sourceTopic, (payload) => {
    if (windowOpen) {
      pending = payload
      hasPending = true
      return
    }
    windowOpen = true
    pubsub.publish(topic, payload)
    setTimeout(closeWindow, intervalMs)
  })

  return topic
}
