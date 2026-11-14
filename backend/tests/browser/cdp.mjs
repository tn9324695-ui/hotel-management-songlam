export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function until(read, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await read(); if (result) return result; await sleep(40); }
  throw new Error('Browser fixture timed out');
}
export class CDP {
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    socket.addEventListener('message', event => {
      const value = JSON.parse(event.data);
      if (value.id) {
        const task = this.pending.get(value.id); if (!task) return;
        clearTimeout(task.timer); this.pending.delete(value.id);
        if (value.error) task.reject(new Error('CDP command rejected')); else task.resolve(value.result);
      } else for (const handler of this.handlers.get(value.method) || []) handler(value.params);
    });
  }
  on(name, handler) { if (!this.handlers.has(name)) this.handlers.set(name, []); this.handlers.get(name).push(handler); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
      this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser fixture script failed');
    return result.result.value;
  }
}
