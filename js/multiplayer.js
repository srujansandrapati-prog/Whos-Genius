import {
  db,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  off,
  serverTimestamp,
  onDisconnect
} from "./firebase-config.js";

// Configurable Defaults (Section 4.3 S05/S06 & Section 16 of Spec)
export const ROOM_EXPIRY_MS = 30 * 60 * 1000;      // 30 minutes room code validity
export const RECONNECT_GRACE_MS = 90 * 1000;       // 90 seconds disconnect grace period
export const QUIZ_DURATION_MS = 7 * 60 * 1000;     // 7 minutes (420 seconds) shared quiz timer

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Unambiguous alphanumeric set

function randomCode(len = 6) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return out;
}

// Generate a guaranteed unique 6-character Room Code
export async function createPrivateRoom(hostProfile) {
  let code = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomCode(6);
    const snap = await get(ref(db, `rooms/${candidate}`));
    if (!snap.exists()) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error("Could not generate a unique room code. Please try again.");

  const now = Date.now();
  const roomData = {
    roomCode: code,
    hostUid: hostProfile.uid,
    guestUid: null,
    status: "WAITING_FOR_PLAYERS",
    createdAt: now,
    expiresAt: now + ROOM_EXPIRY_MS,
    matchId: null,
    host: {
      uid: hostProfile.uid,
      displayName: hostProfile.displayName,
      photoURL: hostProfile.photoURL,
      ready: true,
      connected: true,
      lastSeen: serverTimestamp()
    },
    guest: null
  };

  const roomRef = ref(db, `rooms/${code}`);
  await set(roomRef, roomData);

  // Presence tracking: mark host disconnected on abrupt tab close
  const hostConnRef = ref(db, `rooms/${code}/host/connected`);
  onDisconnect(hostConnRef).set(false);

  return roomData;
}

// Validate and join an existing 6-character Room Code (Section 4.3 S05/S06 & Section 10)
export async function joinPrivateRoom(rawCode, userProfile) {
  const code = (rawCode || "").trim().toUpperCase();
  if (code.length !== 6) {
    throw new Error("Please enter a valid 6-character room code.");
  }

  const roomRef = ref(db, `rooms/${code}`);
  const snap = await get(roomRef);

  if (!snap.exists()) {
    throw new Error("Room not found. Please check the code and try again.");
  }

  const room = snap.val();
  const now = Date.now();

  if (room.status === "CANCELLED") {
    throw new Error("This room was closed by the host.");
  }

  if (room.expiresAt && now > room.expiresAt && room.status === "WAITING_FOR_PLAYERS") {
    throw new Error("This room code has expired. Ask the host to create a new room.");
  }

  // Allow seamless reconnection if user is already Host or Guest in this room
  if (room.hostUid === userProfile.uid) {
    await update(ref(db, `rooms/${code}/host`), {
      connected: true,
      lastSeen: serverTimestamp()
    });
    onDisconnect(ref(db, `rooms/${code}/host/connected`)).set(false);
    return { roomCode: code, role: "host", room };
  }

  if (room.guestUid === userProfile.uid) {
    await update(ref(db, `rooms/${code}/guest`), {
      connected: true,
      lastSeen: serverTimestamp()
    });
    onDisconnect(ref(db, `rooms/${code}/guest/connected`)).set(false);
    return { roomCode: code, role: "guest", room };
  }

  // Enforce strict 2-player maximum (Reject 3rd player)
  if (room.guestUid && room.guestUid !== userProfile.uid) {
    throw new Error("Room is full! Both player slots are already occupied.");
  }

  if (room.status !== "WAITING_FOR_PLAYERS" && room.status !== "LOBBY_READY") {
    throw new Error("This match has already started.");
  }

  const guestData = {
    uid: userProfile.uid,
    displayName: userProfile.displayName,
    photoURL: userProfile.photoURL,
    ready: false,
    connected: true,
    lastSeen: serverTimestamp()
  };

  await update(roomRef, {
    guestUid: userProfile.uid,
    guest: guestData,
    status: "LOBBY_READY"
  });

  onDisconnect(ref(db, `rooms/${code}/guest/connected`)).set(false);

  return {
    roomCode: code,
    role: "guest",
    room: { ...room, guestUid: userProfile.uid, guest: guestData, status: "LOBBY_READY" }
  };
}

export async function toggleLobbyReady(roomCode, role, currentReadyState) {
  const targetPath = role === "host" ? `rooms/${roomCode}/host/ready` : `rooms/${roomCode}/guest/ready`;
  await set(ref(db, targetPath), !currentReadyState);
}

// Host leaves -> cancel room before start; Guest leaves -> reset slot so host can invite again (Section 10)
export async function leaveRoomLobby(roomCode, role) {
  if (!roomCode) return;
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) return;

  const room = snap.val();
  if (role === "host") {
    await update(roomRef, {
      status: "CANCELLED",
      cancelledAt: serverTimestamp()
    });
  } else if (role === "guest") {
    await update(roomRef, {
      guestUid: null,
      guest: null,
      status: "WAITING_FOR_PLAYERS"
    });
  }
}

// Host starts match when both players have joined and marked Ready (Section 4.3 S06)
export async function hostStartQuestionSelection(roomCode) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const snap = await get(roomRef);
  if (!snap.exists()) throw new Error("Room no longer exists.");

  const room = snap.val();
  if (!room.guest || !room.host?.ready || !room.guest?.ready) {
    throw new Error("Both players must join and mark Ready before starting.");
  }

  const matchRef = push(ref(db, "matches"));
  const matchId = matchRef.key;

  const matchData = {
    matchId,
    roomCode,
    mode: "pvp",
    state: "SELECTING_QUESTIONS",
    createdAt: serverTimestamp(),
    playerA: {
      uid: room.host.uid,
      displayName: room.host.displayName,
      photoURL: room.host.photoURL,
      selectionLocked: false,
      selectedForOpponent: []
    },
    playerB: {
      uid: room.guest.uid,
      displayName: room.guest.displayName,
      photoURL: room.guest.photoURL,
      selectionLocked: false,
      selectedForOpponent: []
    }
  };

  await set(matchRef, matchData);
  await update(roomRef, {
    status: "SELECTING_QUESTIONS",
    matchId
  });

  return matchId;
}

// Lock a player's 10 selected questions and exchange sets when both sides lock (Section 3 & 8.3)
export async function submitPvpQuestionSelection(matchId, playerRoleKey, selectedQuestionIds) {
  const playerPath = `matches/${matchId}/${playerRoleKey}`;
  await update(ref(db, playerPath), {
    selectedForOpponent: selectedQuestionIds,
    selectionLocked: true,
    lockedAt: serverTimestamp()
  });

  // Check if both players have now locked their 10 questions
  const matchSnap = await get(ref(db, `matches/${matchId}`));
  if (!matchSnap.exists()) return;
  const match = matchSnap.val();

  if (match.playerA?.selectionLocked && match.playerB?.selectionLocked) {
    if (match.state === "SELECTING_QUESTIONS" || match.state === "WAITING_FOR_SELECTIONS") {
      const now = Date.now();
      await update(ref(db, `matches/${matchId}`), {
        state: "IN_PROGRESS",
        startAt: now,
        deadlineAt: now + QUIZ_DURATION_MS
      });
    }
  } else {
    await update(ref(db, `matches/${matchId}`), {
      state: "WAITING_FOR_SELECTIONS"
    });
  }
}

// Real-time listener for Room Lobby updates
export function subscribeToRoom(roomCode, onUpdate) {
  const roomRef = ref(db, `rooms/${roomCode}`);
  const listener = onValue(roomRef, (snap) => {
    onUpdate(snap.exists() ? snap.val() : null);
  });
  return () => off(roomRef, "value", listener);
}

// Real-time listener for Match state transitions (Selection Locked -> Quiz Start)
export function subscribeToMatch(matchId, onUpdate) {
  const matchRef = ref(db, `matches/${matchId}`);
  const listener = onValue(matchRef, (snap) => {
    onUpdate(snap.exists() ? snap.val() : null);
  });
  return () => off(matchRef, "value", listener);
}
