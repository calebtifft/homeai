type SubscriptionChangeListener = () => void;

const listeners = new Set<SubscriptionChangeListener>();

/** Subscribe to local subscription profile writes (purchase, plan change, restore). */
export function subscribeSubscriptionChange(
  listener: SubscriptionChangeListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifySubscriptionChange(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore listener errors */
    }
  }
}
