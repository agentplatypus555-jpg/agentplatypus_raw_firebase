import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  update,
  remove,
  onValue,
  get,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD4EfZdV9nImXWqdoiUIRPI_jNGQHaGvWc",
  authDomain: "agentplatypus-63aec.firebaseapp.com",
  databaseURL: "https://agentplatypus-63aec-default-rtdb.firebaseio.com",
  projectId: "agentplatypus-63aec",
  storageBucket: "agentplatypus-63aec.firebasestorage.app",
  messagingSenderId: "1049007893653",
  appId: "1:1049007893653:web:5f86529bab3ff889d33f9c",
  measurementId: "G-6BKRPR87Z2",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export const paths = {
  admins: "admins",
  employees: "employees",
  projects: "projects",
  assignments: "assignments",
  reports: "reports",
  tickets: "tickets",
  followups: "followups",
  clients: "clients",
};

function rowsFrom(val) {
  return Object.entries(val || {})
    .map(([id, data]) => ({ id, ...(data || {}) }))
    .sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
}

export function listen(path, onRows) {
  return onValue(
    ref(db, path),
    (snap) => onRows(rowsFrom(snap.val())),
    (error) => onRows(null, error),
  );
}

export function listenMany(keys, onData, onError) {
  const state = {};
  const seen = new Set();
  keys.forEach((key) => { state[key] = []; });
  const stops = keys.map((key) => listen(paths[key], (rows, error) => {
    if (error) {
      onError?.(error);
      return;
    }
    seen.add(key);
    state[key] = rows;
    const ready = seen.size === keys.length;
    onData(Object.fromEntries(keys.map((name) => [name, state[name].slice()])), ready);
  }));
  return () => stops.forEach((stop) => stop());
}

export function watchConnection(onChange) {
  return onValue(ref(db, ".info/connected"), (snap) => onChange(snap.val() === true));
}

function signalBusy(on) {
  document.dispatchEvent(new CustomEvent("ap-busy", { detail: on }));
}

async function gate(work) {
  signalBusy(true);
  try {
    return await work();
  } finally {
    signalBusy(false);
  }
}

export async function readList(path) {
  const snap = await get(ref(db, path));
  return rowsFrom(snap.val());
}

export function addRow(path, data) {
  return gate(() => push(ref(db, path), {
    ...data,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

export function saveRow(path, id, data) {
  return gate(() => update(ref(db, `${path}/${id}`), {
    ...data,
    updatedAt: Date.now(),
  }));
}

export function deleteRow(path, id) {
  return gate(() => remove(ref(db, `${path}/${id}`)));
}

export function changeRow(path, id, updater) {
  return gate(() => runTransaction(ref(db, `${path}/${id}`), (current) => {
    if (current == null) return current;
    const next = updater(current);
    return next === undefined ? undefined : { ...next, updatedAt: Date.now() };
  }));
}
