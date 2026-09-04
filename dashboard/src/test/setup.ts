class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

class IntersectionObserverStub {
  observe(): void {}
  disconnect(): void {}
}

class EventSourceStub {
  addEventListener(): void {}
  close(): void {}
  set onerror(_handler: () => void) {}
}

Object.assign(globalThis, {
  ResizeObserver: ResizeObserverStub,
  IntersectionObserver: IntersectionObserverStub,
  EventSource: EventSourceStub,
});

if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:obol-test";
}

if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => undefined;
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("dark"),
      media: query,
      onchange: null,
      addEventListener(): void {},
      removeEventListener(): void {},
      addListener(): void {},
      removeListener(): void {},
      dispatchEvent(): boolean {
        return false;
      },
    }),
  });
}
