import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBJxxcGhuYspiZ9HRAlZgihgXLaA2FjPXc",
  authDomain: "coastalcouponverifier.firebaseapp.com",
  projectId: "coastalcouponverifier",
  storageBucket: "coastalcouponverifier.appspot.com",
  messagingSenderId: "189807704712",
  appId: "1:189807704712:web:9427e68464115f388ebd3d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentBusiness = null;
let businessUID = null;
let redemptionLimit = null;
let resetInterval = null;
let currentCode = null;

const codeInput = document.getElementById("codeInput");
const verifyBtn = document.getElementById("verifyBtn");
const redeemBtn = document.getElementById("redeemBtn");
const doneBtn = document.getElementById("doneBtn");
const status = document.getElementById("redeemStatus");
const historySection = document.getElementById("redemptionHistorySection");
const historyList = document.getElementById("redemptionHistory");
const analyticsSection = document.getElementById("analytics");

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

function generateCSV(data) {
  const headers = ["Code", "Date", "Business", "Notes", "Edited"];
  const rows = data.map(r => [
    r.code,
    formatDate(r.date),
    r.business,
    r.notes || "",
    r.edited ? "Yes" : "No"
  ]);
  return [headers, ...rows].map(e => e.join(",")).join("\n");
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  d.setHours(0, 0, 0, 0);
  return d;
}

function calculateResetDate(start, interval) {
  if (!interval || interval === "none") return null;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);

  if (["monthly", "1 month"].includes(interval)) return addMonths(d, 1);
  if (["weekly", "1 week"].includes(interval)) return addDays(d, 7);
  if (["daily", "1 day"].includes(interval)) return addDays(d, 1);
  return null;
}

async function refreshRedemptionHistory() {
  historyList.innerHTML = "";
  const snap = await getDocs(collection(db, `businessAccounts/${businessUID}/redemptions`));
  let data = [];
  snap.forEach(doc => {
    const r = doc.data();
    if (!r.deleted && r.code === currentCode) {
      data.push({ id: doc.id, ...r });
    }
  });

  data.sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const r of data) {
    const li = document.createElement("li");
    li.innerHTML = `${formatDate(r.date)} — <strong>${r.code}</strong> — ${r.notes || "No notes"} 
      <button class="delete-button" data-id="${r.id}">Delete</button>`;
    historyList.appendChild(li);
  }

  historySection.style.display = data.length ? "block" : "none";
}

async function enforceRedemptionLimit(code) {
  const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`));
  const snapshot = await getDocs(q);

  const all = [];
  snapshot.forEach(doc => {
    const d = doc.data();
    if (!d.deleted && d.code === code) {
      all.push({ id: doc.id, ...d });
    }
  });

  const valid = all.filter(r => !r.deleted);
  const latest = valid.length ? new Date(valid[valid.length - 1].date) : new Date();
  const resetDate = calculateResetDate(latest, resetInterval);

  const inWindow = valid.filter(r => {
    if (!resetInterval) return true;
    const rDate = new Date(r.date);
    return rDate >= new Date(latest);
  });

  const limitReached = redemptionLimit !== "unlimited" &&
    inWindow.length >= parseInt(redemptionLimit);

  return { limitReached, resetDate };
}

verifyBtn.addEventListener("click", async () => {
  const code = codeInput.value.trim();
  if (!code) return alert("Please enter a code.");
  currentCode = code;

  const verifiedSnap = await getDoc(doc(db, "verifiedCodes", code));
  if (!verifiedSnap.exists()) {
    status.innerText = "❌ Invalid code.";
    return;
  }

  const { limitReached, resetDate } = await enforceRedemptionLimit(code);

  if (limitReached) {
    let msg = `✅ Code is valid. Redemption limit reached (${redemptionLimit}).`;
    if (resetDate) {
      msg += ` Try again after: ${resetDate.toLocaleDateString()}`;
    }
    status.innerText = msg;
    redeemBtn.disabled = true;
  } else {
    status.innerText = "✅ Code is valid!";
    redeemBtn.disabled = false;
  }

  verifyBtn.style.display = "none";
  redeemBtn.style.display = "inline-block";
  doneBtn.style.display = "inline-block";

  await refreshRedemptionHistory();
});

redeemBtn.addEventListener("click", async () => {
  const now = new Date().toISOString();

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code: currentCode,
    date: now,
    business: currentBusiness,
    notes: "",
    edited: false,
    deleted: false
  });

  status.innerText = "✅ Code redeemed successfully!";
  await refreshRedemptionHistory();
  redeemBtn.disabled = true;
});

doneBtn.addEventListener("click", () => {
  codeInput.value = "";
  status.innerText = "";
  verifyBtn.style.display = "inline-block";
  redeemBtn.style.display = "none";
  doneBtn.style.display = "none";
  historyList.innerHTML = "";
  historySection.style.display = "none";
});

historyList.addEventListener("click", async (e) => {
  if (e.target.classList.contains("delete-button")) {
    const id = e.target.dataset.id;
    await updateDoc(doc(db, `businessAccounts/${businessUID}/redemptions`, id), {
      deleted: true,
      edited: true
    });
    await refreshRedemptionHistory();
  }
});

// EXPORT CSV + ANALYTICS
document.getElementById("exportBtn").addEventListener("click", async () => {
  const snap = await getDocs(collection(db, `businessAccounts/${businessUID}/redemptions`));
  const redemptions = [];

  snap.forEach(doc => {
    const d = doc.data();
    if (!d.deleted) redemptions.push(d);
  });

  redemptions.sort((a, b) => new Date(a.date) - new Date(b.date));
  const csv = generateCSV(redemptions);
  const url = await uploadCSVFile(csv, `${currentBusiness}_redemptions.csv`);

  const params = {
    businessName: currentBusiness,
    verifiedCount: new Set(redemptions.map(r => r.code)).size,
    redemptionCount: redemptions.length,
    firstRedemption: redemptions[0] ? formatDate(redemptions[0].date) : "N/A",
    latestRedemption: redemptions[redemptions.length - 1] ? formatDate(redemptions[redemptions.length - 1].date) : "N/A",
    fileUrl: url,
    to_email: window.businessEmail
  };

  emailjs.send("service_zn4nuce", "template_2zb6jgh", params)
    .then(() => alert("✅ Export sent to your email!"))
    .catch(err => {
      console.error("Email failed:", err);
      alert("❌ Failed to send email.");
    });
});

// Auth check
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const uid = user.uid;
    window.businessEmail = user.email;
    const ref = doc(db, "businessAccounts", uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      currentBusiness = data.businessName;
      businessUID = uid;
      redemptionLimit = data.redemptionLimit;
      resetInterval = data.resetInterval;

      document.getElementById("business-info").innerHTML = `
        <p><strong>Business Name:</strong> ${data.businessName}</p>
        <p><strong>Coupon Offer:</strong> ${data.couponOffer}</p>
        <p><strong>Redemption Limit:</strong> ${redemptionLimit}</p>
        <p><strong>Reset Interval:</strong> ${resetInterval}</p>
      `;
    }
  } else {
    window.location.href = "login.html";
  }
});
