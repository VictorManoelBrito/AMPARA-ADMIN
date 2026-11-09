// Configuração do Firebase Web SDK.
// Usando os dados do projeto AMPARA fornecidos.
const firebaseConfig = {
  apiKey: "AIzaSyBwEptXHWsI5f7jsph2-N4eCuX8nPv-W6I",
  authDomain: "ampara-fbb95.firebaseapp.com",
  databaseURL: "https://ampara-fbb95-default-rtdb.firebaseio.com",
  projectId: "ampara-fbb95",
  storageBucket: "ampara-fbb95.firebasestorage.app",
  messagingSenderId: "125232193329",
  appId: "1:125232193329:web:f86cf67e44c59a54721a10",
  measurementId: "G-PYP56CB0LV"
};

let app;
let db;

function initFirebase() {
  if (typeof firebase === "undefined") {
    console.warn("Firebase SDK não carregado.");
    return false;
  }

  if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
  } else {
    app = firebase.app();
  }

  db = firebase.firestore();
  window.firebaseDb = db;
  window.firebaseAuth = firebase.auth();
  window.firebaseReady = true;
  return true;
}

initFirebase();
