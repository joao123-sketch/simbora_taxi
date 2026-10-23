import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMessages, subscribeToMessages, type Message } from '../lib/chat';

const POLL_MS = 8000;

// Mensagens da corrida em tempo real, com a contagem das que o outro mandou e
// ainda não foram vistas (chat fechado).
export function useChat(rideId: number, myId: string, enabled: boolean, open: boolean) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;

  const merge = useCallback(
    (incoming: Message[]) => {
      setMessages((current) => {
        const known = new Set(current.map((m) => m.id));
        const fresh = incoming.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return current;
        if (!openRef.current) {
          const fromOther = fresh.filter((m) => m.sender_id !== myId).length;
          if (fromOther > 0) setUnread((n) => n + fromOther);
        }
        return [...current, ...fresh].sort((a, b) => a.id - b.id);
      });
    },
    [myId],
  );

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      fetchMessages(rideId)
        .then((list) => alive && merge(list))
        .catch(() => {});

    // A primeira carga não conta como "nova".
    fetchMessages(rideId)
      .then((list) => alive && setMessages(list))
      .catch(() => {});
    const unsubscribe = subscribeToMessages(rideId, (message) => merge([message]));
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      unsubscribe();
      clearInterval(timer);
    };
  }, [rideId, enabled, merge]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  return { messages, unread };
}
