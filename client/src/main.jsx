import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import Games from './games';
import './styles.css';

/* =========================================================
   PRODUCTION / LOCAL API CONFIG
   ========================================================= */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const SOCKET_ORIGIN =
  import.meta.env.VITE_API_ORIGIN || undefined;

/* =========================================================
   API HELPER
   ========================================================= */

const api = async (u, o = {}) => {
  const r = await fetch(API_BASE + u, {
    ...o,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem(
        'together_token'
      )}`,
      ...(o.headers || {})
    }
  });

  const raw = await r.text();

  let d = {};

  try {
    d = raw ? JSON.parse(raw) : {};
  } catch {
    d = {
      message:
        raw || 'Server returned an invalid response.'
    };
  }

  if (!r.ok) {
    throw Error(d.message || 'Request failed');
  }

  return d;
};

/* =========================================================
   AUTH
   ========================================================= */

function Auth({ done }) {
  const [m, setM] = useState('login');

  const [f, setF] = useState({
    name: '',
    email: '',
    password: ''
  });

  const [e, setE] = useState('');

  const go = async (x) => {
    x.preventDefault();
    setE('');

    try {
      const d = await api(
        '/auth/' +
          (m === 'login' ? 'login' : 'register'),
        {
          method: 'POST',
          body: JSON.stringify(f)
        }
      );

      localStorage.setItem(
        'together_token',
        d.token
      );

      done(d.user);
    } catch (x) {
      setE(x.message);
    }
  };

  return (
    <main className="auth">
      <div className="brand">
        Together<span>•</span>
      </div>

      <h1>
        Don't just call.
        <br />
        <em>Hang out.</em>
      </h1>

      <p className="muted">
        Your small virtual room for the people you care
        about.
      </p>

      <form onSubmit={go}>
        {m === 'register' && (
          <input
            placeholder="Your name"
            value={f.name}
            onChange={(x) =>
              setF({
                ...f,
                name: x.target.value
              })
            }
          />
        )}

        <input
          type="email"
          placeholder="Email"
          value={f.email}
          onChange={(x) =>
            setF({
              ...f,
              email: x.target.value
            })
          }
        />

        <input
          type="password"
          placeholder="Password (6+ characters)"
          value={f.password}
          onChange={(x) =>
            setF({
              ...f,
              password: x.target.value
            })
          }
        />

        {e && (
          <div className="error">
            {e}
          </div>
        )}

        <button>
          {m === 'login'
            ? 'Enter Together'
            : 'Create account'}
        </button>
      </form>

      <button
        className="link"
        onClick={() => {
          setM(
            m === 'login'
              ? 'register'
              : 'login'
          );
          setE('');
        }}
      >
        {m === 'login'
          ? 'New here? Create an account'
          : 'Already have an account? Login'}
      </button>
    </main>
  );
}

/* =========================================================
   REMOTE VIDEO
   ========================================================= */

function Remote({
  stream,
  name = 'Guest'
}) {
  const r = useRef();

  useEffect(() => {
    if (r.current) {
      r.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="videoCard">
      <video
        ref={r}
        autoPlay
        playsInline
      />

      <span>{name}</span>
    </div>
  );
}

/* =========================================================
   ROOM
   ========================================================= */

function Room({
  room,
  user,
  s,
  onLeave
}) {
  const local = useRef();
  const stream = useRef();
  const screenStream = useRef();
  const pcs = useRef({});

  const [cam, setCam] = useState(true);
  const [mic, setMic] = useState(true);
  const [sharing, setSharing] =
    useState(false);

  const [connected, setConnected] =
    useState(s.connected);

  const [remote, setRemote] =
    useState([]);

  const [msgs, setMsgs] =
    useState([]);

  const [text, setText] =
    useState('');

  const [notice, setNotice] =
    useState('');

  const [people, setPeople] =
    useState([]);

  const [reactions, setReactions] =
    useState([]);

  /* =======================================================
     WEBRTC CONNECTION
     ======================================================= */

  const make = async (uid) => {
    if (!uid || uid === user.id) return null;

    let pc = pcs.current[uid];
    if (pc) return pc;

    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    });

    pc.__pendingIce = [];
    pcs.current[uid] = pc;

    const currentVideo =
      screenStream.current?.getVideoTracks()[0] ||
      stream.current?.getVideoTracks()[0];

    if (currentVideo) {
      const source = screenStream.current || stream.current;
      const sender = pc.addTrack(currentVideo, source);
      const params = sender.getParameters();
      params.encodings = params.encodings?.length
        ? params.encodings
        : [{}];
      params.encodings[0].maxBitrate = 3000000;
      params.encodings[0].maxFramerate = 30;
      sender.setParameters(params).catch(() => {});
    }

    stream.current
      ?.getTracks()
      .filter((t) => t.kind === 'audio')
      .forEach((t) => pc.addTrack(t, stream.current));

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      s.emit('webrtc:signal', {
        roomId: room.id,
        target: uid,
        data: {
          type: 'candidate',
          candidate: e.candidate
        }
      });
    };

    pc.ontrack = (e) => {
      const incoming = e.streams?.[0];
      if (!incoming) return;

      setRemote((a) => [
        ...a.filter((x) => x.id !== uid),
        {
          id: uid,
          stream: incoming,
          name:
            people.find((p) => p.id === uid)?.name ||
            'Guest'
        }
      ]);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;

      if (state === 'connected') {
        setNotice(
          `Connected to ${
            people.find((p) => p.id === uid)?.name || 'participant'
          }.`
        );
        setTimeout(() => setNotice(''), 1800);
      }

      if (state === 'failed') {
        setNotice(
          'Direct video connection failed. Retrying…'
        );
      }
    };

    return pc;
  };

  const shouldOffer = (uid) => {
    if (!uid || uid === user.id) return false;
    return String(user.id) < String(uid);
  };

  const sendOffer = async (uid) => {
    if (!shouldOffer(uid)) return;

    const pc = await make(uid);
    if (!pc) return;

    if (
      pc.signalingState !== 'stable' &&
      pc.signalingState !== 'have-local-offer'
    ) {
      return;
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      s.emit('webrtc:signal', {
        roomId: room.id,
        target: uid,
        data: pc.localDescription
      });
    } catch (error) {
      console.error('Together WebRTC offer failed:', error);
    }
  };

  /* =======================================================
     ROOM EFFECT
     ======================================================= */

  useEffect(() => {
    let alive = true;

    api(`/rooms/${room.id}/messages`)
      .then((d) => setMsgs(d.messages))
      .catch(() => {});

    const onConnect = () => {
      setConnected(true);
      s.emit('room:join', room.id);
    };

    const onDisconnect = () => setConnected(false);

    s.on('connect', onConnect).on('disconnect', onDisconnect);

    s.on(
      'room:users',
      users
    )
      .on(
        'webrtc:signal',
        signal
      )
      .on(
        'chat:message',
        chat
      )
      .on(
        'room:notice',
        n
      )
      .on(
        'room:presence',
        p
      )
      .on(
        'room:reaction',
        react
      );

    (async () => {
      try {
        stream.current =
          await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              aspectRatio: { ideal: 16 / 9 },
              frameRate: { ideal: 30, max: 30 }
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });

        if (alive && local.current) {
          local.current.srcObject = stream.current;
        }
      } catch {
        setNotice(
          'Camera/microphone unavailable. You can still use chat.'
        );
      }

      if (s.connected) {
        s.emit('room:join', room.id);
      }
    })();

    /*
       IMPORTANT:
       The server tells us which existing participants are already
       in this exact room. Only the participant with the smaller
       stable user ID creates the offer. This prevents offer glare.
    */
    const users = async (ids) => {
      const peers = (ids || []).filter(
        (id) => id && id !== user.id
      );

      for (const id of peers) {
        await make(id);
      }

      for (const id of peers) {
        if (shouldOffer(id)) {
          await sendOffer(id);
        }
      }
    };

    /* WebRTC signaling */
    const signal = async ({ from, data }) => {
      if (!from || from === user.id || !data) return;

      const pc = await make(from);
      if (!pc) return;

      try {
        if (data.type === 'offer') {
          /*
             The smaller ID is the only intended offerer.
             If an unexpected simultaneous offer arrives, use
             rollback so the connection can recover instead of
             getting stuck in have-local-offer.
          */
          if (pc.signalingState === 'have-local-offer') {
            if (shouldOffer(from)) return;
            await pc.setLocalDescription({
              type: 'rollback'
            });
          }

          await pc.setRemoteDescription(data);

          if (pc.__pendingIce?.length) {
            const pending = pc.__pendingIce.splice(0);
            for (const candidate of pending) {
              await pc.addIceCandidate(candidate).catch(() => {});
            }
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          s.emit('webrtc:signal', {
            roomId: room.id,
            target: from,
            data: pc.localDescription
          });
        } else if (data.type === 'answer') {
          if (pc.signalingState !== 'have-local-offer') {
            return;
          }

          await pc.setRemoteDescription(data);

          if (pc.__pendingIce?.length) {
            const pending = pc.__pendingIce.splice(0);
            for (const candidate of pending) {
              await pc.addIceCandidate(candidate).catch(() => {});
            }
          }
        } else if (data.type === 'candidate') {
          if (!data.candidate) return;

          if (pc.remoteDescription) {
            await pc.addIceCandidate(data.candidate).catch(() => {});
          } else {
            pc.__pendingIce.push(data.candidate);
          }
        }
      } catch (error) {
        console.error('Together WebRTC signaling error:', error);
        setNotice(
          'Video negotiation failed. Re-entering the room may retry the connection.'
        );
      }
    };

    /* Chat */
    const chat = (m) => {
      if (
        m.roomId === room.id
      ) {
        setMsgs((x) => [
          ...x,
          m
        ]);
      }
    };

    /* Notices */
    const n = (x) => {
      setNotice(x.text);

      setTimeout(
        () => setNotice(''),
        2500
      );
    };

    /* Presence */
    const p = (x) =>
      setPeople(x);

    /* Reactions */
    const react = (x) => {
      setReactions((a) => [
        ...a,
        x
      ].slice(-8));

      setTimeout(
        () =>
          setReactions((a) =>
            a.filter(
              (y) =>
                y.id !== x.id
            )
          ),
        2200
      );
    };



    return () => {
      alive = false;

      s.off(
        'connect',
        onConnect
      )
        .off(
          'disconnect',
          onDisconnect
        )
        .off(
          'room:users',
          users
        )
        .off(
          'webrtc:signal',
          signal
        )
        .off(
          'chat:message',
          chat
        )
        .off(
          'room:notice',
          n
        )
        .off(
          'room:presence',
          p
        )
        .off(
          'room:reaction',
          react
        );

      screenStream.current
        ?.getTracks()
        .forEach((t) =>
          t.stop()
        );

      stream.current
        ?.getTracks()
        .forEach((t) =>
          t.stop()
        );

      Object.values(
        pcs.current
      ).forEach((p) =>
        p.close()
      );

      pcs.current = {};
    };
  }, [room.id]);

  /* =======================================================
     RESTORE CAMERA
     ======================================================= */

  const restoreCamera = () => {
    const v =
      stream.current
        ?.getVideoTracks()[0];

    if (v) {
      Object.values(
        pcs.current
      ).forEach((p) => {
        p.getSenders()
          .find(
            (q) =>
              q.track?.kind ===
              'video'
          )
          ?.replaceTrack(v);
      });
    }

    if (
      local.current &&
      stream.current
    ) {
      local.current.srcObject =
        stream.current;
    }

    screenStream.current =
      null;

    setSharing(false);
  };

  /* =======================================================
     STOP SCREEN SHARE
     ======================================================= */

  const stopShare = () => {
    const x =
      screenStream.current;

    if (x) {
      x.getTracks().forEach(
        (t) => t.stop()
      );

      screenStream.current =
        null;
    }

    restoreCamera();
  };

  /* =======================================================
     SCREEN SHARE
     ======================================================= */

  const share = async () => {
    if (sharing) {
      stopShare();
      return;
    }

    try {
      const x =
        await navigator.mediaDevices.getDisplayMedia(
          {
            video: {
              width: {
                ideal: 1920
              },
              height: {
                ideal: 1080
              },
              frameRate: {
                ideal: 30,
                max: 60
              }
            },
            audio: false
          }
        );

      const t =
        x.getVideoTracks()[0];

      screenStream.current =
        x;

      Object.values(
        pcs.current
      ).forEach((p) => {
        p.getSenders()
          .find(
            (q) =>
              q.track?.kind ===
              'video'
          )
          ?.replaceTrack(t);
      });

      if (local.current) {
        local.current.srcObject =
          x;
      }

      setSharing(true);

      t.onended = () =>
        restoreCamera();
    } catch {}
  };

  /* =======================================================
     CHAT
     ======================================================= */

  const send = (e) => {
    e.preventDefault();

    if (text.trim()) {
      s.emit(
        'chat:send',
        {
          roomId: room.id,
          text
        }
      );

      setText('');
    }
  };

  /* =======================================================
     MIC / CAMERA TOGGLE
     ======================================================= */

  const toggle = (k) => {
    stream.current
      ?.getTracks()
      .filter(
        (t) => t.kind === k
      )
      .forEach(
        (t) =>
          (t.enabled =
            !t.enabled)
      );

    if (k === 'video') {
      setCam((x) => !x);
    } else {
      setMic((x) => !x);
    }
  };

  /* =======================================================
     REACTIONS
     ======================================================= */

  const react = (emoji) =>
    s.emit(
      'room:reaction',
      {
        roomId: room.id,
        emoji
      }
    );

  /* =======================================================
     ROOM UI
     ======================================================= */

  return (
    <div className="room">
      <header>
        <div>
          <strong>
            {room.name}
          </strong>

          <small>
            Room code:{' '}
            <b>
              {room.code || '—'}
            </b>
          </small>
        </div>

        <div className="roomStatus">
          <span
            className={
              connected
                ? 'statusDot online'
                : 'statusDot'
            }
          />

          {connected
            ? 'Connected'
            : 'Reconnecting…'}

          <button
            className="danger"
            onClick={onLeave}
          >
            Leave
          </button>
        </div>
      </header>

      {notice && (
        <div className="notice">
          {notice}
        </div>
      )}

      <div className="floatingReactions">
        {reactions.map((x) => (
          <div
            key={x.id}
            className="reactionPop"
          >
            <span>
              {x.emoji}
            </span>

            <small>
              {x.userName}
            </small>
          </div>
        ))}
      </div>

      <section className="stage">
        <div className="videos">
          <div className="videoCard">
            <video
              ref={local}
              autoPlay
              muted
              playsInline
            />

            <span>
              You · {user.name}
            </span>
          </div>

          {remote.map((x) => (
            <Remote
              key={x.id}
              stream={x.stream}
              name={x.name}
            />
          ))}
        </div>

        <div className="controls">
          <button
            onClick={() =>
              toggle('audio')
            }
          >
            {mic
              ? '🎙️'
              : '🔇'}
          </button>

          <button
            onClick={() =>
              toggle('video')
            }
          >
            {cam
              ? '📷'
              : '🚫'}
          </button>

          <button
            className={
              sharing
                ? 'shareActive'
                : ''
            }
            onClick={share}
          >
            {sharing
              ? '⏹ Stop sharing'
              : '🖥️ Share screen'}
          </button>

          <div className="reactionBar">
            {[
              '❤️',
              '😂',
              '👏',
              '🔥',
              '👍',
              '🎉'
            ].map((x) => (
              <button
                key={x}
                onClick={() =>
                  react(x)
                }
              >
                {x}
              </button>
            ))}
          </div>
        </div>

        <div className="peopleBar">
          <b>
            In this room
          </b>

          {people.map((p) => (
            <span
              key={p.id}
              className="person"
            >
              <i
                className={
                  p.online
                    ? 'onlineDot'
                    : ''
                }
              />

              {p.name}
            </span>
          ))}
        </div>
      </section>

      <Games
        socket={s}
        roomId={room.id}
        user={user}
        people={people}
      />

      <aside className="chat">
        <h3>
          Room chat
        </h3>

        <div className="messages">
          {msgs.map((m) => (
            <div
              className={
                m.userId ===
                user.id
                  ? 'mine'
                  : ''
              }
              key={m.id}
            >
              <b>
                {m.userName}
              </b>

              <span>
                {m.text}
              </span>
            </div>
          ))}
        </div>

        <form onSubmit={send}>
          <input
            value={text}
            onChange={(e) =>
              setText(
                e.target.value
              )
            }
            placeholder="Say something..."
          />

          <button>
            Send
          </button>
        </form>
      </aside>
    </div>
  );
}

/* =========================================================
   MAIN APP
   ========================================================= */

function App() {
  const [u, setU] =
    useState(null);

  const [room, setRoom] =
    useState(null);

  const [rooms, setRooms] =
    useState([]);

  const [fr, setFr] =
    useState({
      friends: [],
      requests: []
    });

  const [q, setQ] =
    useState('');

  const [found, setFound] =
    useState([]);

  const [name, setName] =
    useState('');

  const [joinCode, setJoinCode] =
    useState('');

  const [err, setErr] =
    useState('');

  const [s, setS] =
    useState(null);

  /* =======================================================
     RESTORE LOGIN
     ======================================================= */

  useEffect(() => {
    if (
      localStorage.getItem(
        'together_token'
      )
    ) {
      api('/me')
        .then((d) =>
          setU(d.user)
        )
        .catch(() => {
          localStorage.removeItem(
            'together_token'
          );
        });
    }
  }, []);

  /* =======================================================
     LOAD DASHBOARD + SOCKET
     ======================================================= */

  useEffect(() => {
    if (!u) {
      return;
    }

    api('/rooms')
      .then((d) =>
        setRooms(d.rooms)
      )
      .catch(() => {});

    api('/friends')
      .then(setFr)
      .catch(() => {});

    /*
      IMPORTANT:
      In production this connects directly to:

      VITE_API_ORIGIN

      In local development, if VITE_API_ORIGIN
      is not defined, Socket.IO uses the current
      origin and Vite's /socket.io proxy handles it.
    */

    const x = io(
      SOCKET_ORIGIN,
      {
        auth: {
          token:
            localStorage.getItem(
              'together_token'
            )
        }
      }
    );

    setS(x);

    return () =>
      x.disconnect();
  }, [u]);

  /* =======================================================
     AUTH SCREEN
     ======================================================= */

  if (!u) {
    return (
      <Auth done={setU} />
    );
  }

  /* =======================================================
     ROOM SCREEN
     ======================================================= */

  if (room && s) {
    return (
      <Room
        room={room}
        user={u}
        s={s}
        onLeave={() =>
          setRoom(null)
        }
      />
    );
  }

  /* =======================================================
     CREATE ROOM
     ======================================================= */

  const create = async () => {
    try {
      setErr('');

      const d = await api(
        '/rooms',
        {
          method: 'POST',
          body: JSON.stringify({
            name:
              name ||
              'Together Room'
          })
        }
      );

      setRooms((x) => [
        ...x,
        d.room
      ]);

      setName('');

      setRoom(d.room);
    } catch (x) {
      setErr(x.message);
    }
  };

  /* =======================================================
     JOIN ROOM
     ======================================================= */

  const join = async () => {
    if (!joinCode.trim()) {
      return;
    }

    try {
      setErr('');

      const d = await api(
        '/rooms/' +
          encodeURIComponent(
            joinCode.trim()
          ) +
          '/join',
        {
          method: 'POST'
        }
      );

      setRooms((x) =>
        x.some(
          (r) =>
            r.id === d.room.id
        )
          ? x
          : x.concat(d.room)
      );

      setJoinCode('');

      setRoom(d.room);
    } catch (x) {
      setErr(x.message);
    }
  };

  /* =======================================================
     SEARCH USERS
     ======================================================= */

  const search = async () => {
    try {
      setFound(
        await api(
          '/users/search?q=' +
            encodeURIComponent(q)
        )
      );
    } catch (x) {
      setErr(x.message);
    }
  };

  /* =======================================================
     SEND FRIEND REQUEST
     ======================================================= */

  const add = async (id) => {
    try {
      await api(
        '/friends/request/' +
          id,
        {
          method: 'POST'
        }
      );

      setErr(
        'Friend request sent.'
      );
    } catch (x) {
      setErr(x.message);
    }
  };

  /* =======================================================
     ENTER ROOM
     ======================================================= */

  const enter = async (r) => {
    try {
      setErr('');

      const d = await api(
        '/rooms/' +
          r.id +
          '/join',
        {
          method: 'POST'
        }
      );

      setRoom(d.room);
    } catch (x) {
      setErr(x.message);
    }
  };

  /* =======================================================
     COPY ROOM CODE
     ======================================================= */

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(
        code
      );

      setErr(
        'Room code copied. Share it with your friend.'
      );
    } catch {
      setErr(
        'Room code: ' + code
      );
    }
  };

  /* =======================================================
     REFRESH FRIENDS
     ======================================================= */

  const refresh = async () =>
    setFr(
      await api('/friends')
    );

  /* =======================================================
     DASHBOARD
     ======================================================= */

  return (
    <main className="dashboard">
      <header className="top">
        <div>
          <div className="brand">
            Together<span>•</span>
          </div>

          <small>
            Welcome, {u.name}
          </small>
        </div>

        <button
          className="link"
          onClick={() => {
            localStorage.removeItem(
              'together_token'
            );

            location.reload();
          }}
        >
          Logout
        </button>
      </header>

      {err && (
        <div className="error banner">
          {err}
        </div>
      )}

      <div className="grid">
        {/* =================================================
            HERO
        ================================================= */}

        <section className="panel hero">
          <h1>
            Your people.
            <br />
            <em>Your room.</em>
          </h1>

          <p>
            Start a private room and
            invite a friend. Share the
            room code so they can join
            from their account.
          </p>

          <div className="create">
            <input
              value={name}
              onChange={(e) =>
                setName(
                  e.target.value
                )
              }
              placeholder="Room name"
            />

            <button
              onClick={create}
            >
              Create room
            </button>
          </div>
        </section>

        {/* =================================================
            JOIN ROOM
        ================================================= */}

        <section className="panel joinPanel">
          <h2>
            Join a room
          </h2>

          <p className="muted">
            Enter the room code your
            friend shared with you.
          </p>

          <div className="search">
            <input
              value={joinCode}
              onChange={(e) =>
                setJoinCode(
                  e.target.value.toUpperCase()
                )
              }
              placeholder="e.g. A1B2C3D4E5"
              maxLength={10}
            />

            <button
              onClick={join}
            >
              Join
            </button>
          </div>
        </section>

        {/* =================================================
            FIND FRIENDS
        ================================================= */}

        <section className="panel">
          <h2>
            Find friends
          </h2>

          <div className="search">
            <input
              value={q}
              onChange={(e) =>
                setQ(
                  e.target.value
                )
              }
              placeholder="Name or email"
            />

            <button
              onClick={search}
            >
              Search
            </button>
          </div>

          {found.map((x) => (
            <div
              className="row"
              key={x.id}
            >
              <span>
                <b>
                  {x.name}
                </b>

                <small>
                  {x.email}
                </small>
              </span>

              <button
                onClick={() =>
                  add(x.id)
                }
              >
                Add
              </button>
            </div>
          ))}
        </section>

        {/* =================================================
            YOUR ROOMS
        ================================================= */}

        <section className="panel">
          <h2>
            Your rooms
          </h2>

          {rooms.map((r) => (
            <div
              className="roomRow"
              key={r.id}
            >
              <span>
                <b>
                  {r.name}
                </b>

                <small>
                  {r.members.length}{' '}
                  member
                  {r.members.length !==
                  1
                    ? 's'
                    : ''}{' '}
                  · Code{' '}
                  <strong>
                    {r.code}
                  </strong>
                </small>
              </span>

              <div className="roomActions">
                <button
                  className="secondary"
                  onClick={() =>
                    copy(r.code)
                  }
                >
                  Copy
                </button>

                <button
                  onClick={() =>
                    enter(r)
                  }
                >
                  Enter
                </button>
              </div>
            </div>
          ))}

          {!rooms.length && (
            <p className="muted">
              Create your first room.
            </p>
          )}
        </section>

        {/* =================================================
            FRIENDS
        ================================================= */}

        <section className="panel">
          <h2>
            Friends
          </h2>

          {fr.friends.map((x) => (
            <div
              className="row"
              key={x.id}
            >
              <span>
                <b>
                  {x.name}
                </b>

                <small>
                  {x.email}
                </small>
              </span>
            </div>
          ))}

          {fr.requests.map((x) => (
            <div
              className="row"
              key={x.id}
            >
              <span>
                <b>
                  {x.user.name}
                </b>

                <small>
                  Friend request
                </small>
              </span>

              <button
                onClick={async () => {
                  await api(
                    '/friends/' +
                      x.id +
                      '/accept',
                    {
                      method:
                        'POST'
                    }
                  );

                  refresh();
                }}
              >
                Accept
              </button>
            </div>
          ))}

          {!fr.friends.length &&
            !fr.requests.length && (
              <p className="muted">
                Add someone to get
                started.
              </p>
            )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   START APP
   ========================================================= */

createRoot(
  document.getElementById('root')
).render(
  <App />
);