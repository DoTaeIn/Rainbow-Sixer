// 방 접속. 끊기면 알아서 다시 붙고, 붙으면 join 을 다시 보낸다.
export function connect(room, name, on) {
  let ws, alive = true;
  const queue = [];

  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'join', room, name: name() }));
      queue.splice(0).forEach(m => ws.send(m));
      on({ t: 'status', up: true });
    };
    ws.onmessage = e => on(JSON.parse(e.data));
    ws.onclose = () => {
      on({ t: 'status', up: false });
      if (alive) setTimeout(open, 1000);
    };
    ws.onerror = () => ws.close();
  };
  open();

  return {
    send(msg) {
      const s = JSON.stringify(msg);
      if (ws.readyState === 1) ws.send(s);
      else if (queue.length < 20) queue.push(s);
    },
    close() { alive = false; ws.close(); },
  };
}
