
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

const firebaseConfig = {
  apiKey: "AIzaSyBJxxcGhuYspiZ9HRAlZgihgXLaA2FjPXc",
  authDomain: "coastalcouponverifier.firebaseapp.com",
  projectId: "coastalcouponverifier",
  storageBucket: "coastalcouponverifier.firebasestorage.app",
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

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  result.setHours(0, 0, 0, 0);
  return result;
}

function calculateResetDate(startDate, interval) {
  if (!interval || interval === "none") return null;
  const date = new Date(startDate);
  date.setHours(0, 0, 0, 0);

  if (["monthly", "1 month"].includes(interval)) return addMonths(date, 1);
  if (["weekly", "1 week"].includes(interval)) return addDays(date, 7);
  if (["daily", "1 day"].includes(interval)) return addDays(date, 1);

  return null;
}

async function updateAnalytics() {
  const snap = await getDocs(collection(db, `businessAccounts/${businessUID}/redemptions`));
  const redemptions = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) redemptions.push(data);
  });

  const uniqueCodes = new Set(redemptions.map(r => r.code));
  document.getElementById("activeCustomers").innerText = uniqueCodes.size;
  document.getElementById("totalRedemptions").innerText = redemptions.length;
}

async function refreshRedemptionHistory() {
  const snapshot = await getDocs(collection(db, `businessAccounts/${businessUID}/redemptions`));
  const history = document.getElementById("redemptionHistory");
  history.innerHTML = "";

  const redemptions = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.deleted) redemptions.push({ id: doc.id, ...data });
  });

  redemptions.forEach(entry => {
    const li = document.createElement("li");
    li.textContent = `${entry.code} — ${formatDate(entry.date)}`;
    const btn = document.createElement("button");
    btn.className = "delete-button";
    btn.textContent = "Delete";
    btn.onclick = async () => {
      await updateDoc(doc(db, `businessAccounts/${businessUID}/redemptions/${entry.id}`), { deleted: true });
      refreshRedemptionHistory();
    };
    li.appendChild(btn);
    history.appendChild(li);
  });

  document.getElementById("redemptionHistorySection").style.display = "block";
  updateAnalytics();
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const uid = user.uid;
    const docRef = doc(db, "businessAccounts", uid);
    const businessSnap = await getDoc(docRef);

    if (businessSnap.exists()) {
      const data = businessSnap.data();
      document.getElementById("business-info").innerHTML = `
        <p><strong>Business Name:</strong> ${data.businessName}</p>
        <p><strong>Coupon Offer:</strong> ${data.couponOffer}</p>
        <p><strong>Redemption Limit:</strong> ${data.redemptionLimit}</p>
        <p><strong>Reset Interval:</strong> ${data.resetInterval}</p>
      `;
      currentBusiness = data.businessName;
      businessUID = uid;
      redemptionLimit = data.redemptionLimit;
      resetInterval = data.resetInterval;

      refreshRedemptionHistory();
    } else {
      document.getElementById("business-info").innerText = "Business account not found.";
    }
  } else {
    window.location.href = "login.html";
  }
});
