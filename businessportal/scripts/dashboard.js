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
  setDoc,
  collection,
  addDoc,
  deleteDoc,
  getDocs,
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

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

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
  }
});

const codeInput = document.getElementById("codeInput");
const verifyBtn = document.getElementById("verifyBtn");
const redeemBtn = document.getElementById("redeemBtn");
const doneBtn = document.getElementById("doneBtn");
const redeemStatus = document.getElementById("redeemStatus");
const redemptionHistory = document.getElementById("redemptionHistory");
const redemptionHistorySection = document.getElementById("redemptionHistorySection");

let currentCode = "";

verifyBtn.addEventListener("click", async () => {
  currentCode = codeInput.value.trim();
  if (!currentCode) return;

  const codeRef = doc(db, "verifiedCodes", currentCode);
  const codeSnap = await getDoc(codeRef);
  redeemStatus.innerText = "";
  redemptionHistory.innerHTML = "";
  redemptionHistorySection.style.display = "none";
  redeemBtn.disabled = true;
  redeemBtn.style.display = "none";

  if (!codeSnap.exists() || !codeSnap.data().isValid) {
    redeemStatus.innerText = "Invalid or inactive code.";
    return;
  }

  redeemStatus.innerText = "Code is valid.";
  const redemptions = codeSnap.data().redemptions || [];
  const used = redemptions.filter(r => r.business === currentBusiness && !r.deleted);

  if (redemptionLimit !== "unlimited" && used.length >= parseInt(redemptionLimit)) {
    redeemStatus.innerText += ` Redemption limit reached (${redemptionLimit}).`;
  } else {
    redeemBtn.disabled = false;
    redeemBtn.style.display = "inline-block";
  }

  redemptionHistorySection.style.display = "block";
  renderHistory(used);
  doneBtn.style.display = "inline-block";
});

redeemBtn.addEventListener("click", async () => {
  if (!currentCode || !currentBusiness) return;

  const redemption = {
    business: currentBusiness,
    date: new Date().toISOString(),
    edited: false,
    notes: "",
    businessName: currentBusiness
  };

  const codeRef = doc(db, "verifiedCodes", currentCode);
  const codeSnap = await getDoc(codeRef);
  const existing = codeSnap.data().redemptions || [];
  existing.push(redemption);

  await updateDoc(codeRef, { redemptions: existing });

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code: currentCode,
    ...redemption,
    timestamp: serverTimestamp()
  });

  redeemStatus.innerText = "Code redeemed successfully!";
  redeemBtn.disabled = true;
  renderHistory(existing.filter(r => r.business === currentBusiness && !r.deleted));
});

doneBtn.addEventListener("click", () => {
  codeInput.value = "";
  redeemStatus.innerText = "";
  redemptionHistory.innerHTML = "";
  redeemBtn.style.display = "none";
  redemptionHistorySection.style.display = "none";
  doneBtn.style.display = "none";
});

function renderHistory(redemptions) {
  redemptionHistory.innerHTML = "";
  redemptions.forEach((r, index) => {
    const li = document.createElement("li");
    const dateStr = new Date(r.date).toLocaleString();
    li.innerText = `Date: ${dateStr} Status: Redeemed`;
    const delBtn = document.createElement("span");
    delBtn.innerText = " [DELETE]";
    delBtn.className = "delete-button";
    delBtn.onclick = () => deleteRedemption(index);
    li.appendChild(delBtn);
    redemptionHistory.appendChild(li);
  });
}

async function deleteRedemption(index) {
  const codeRef = doc(db, "verifiedCodes", currentCode);
  const codeSnap = await getDoc(codeRef);
  const redemptions = codeSnap.data().redemptions || [];

  if (redemptions[index]) redemptions[index].deleted = true;

  await updateDoc(codeRef, { redemptions });
  redeemStatus.innerText = "Redemption deleted.";
  renderHistory(redemptions.filter(r => r.business === currentBusiness && !r.deleted));
}
