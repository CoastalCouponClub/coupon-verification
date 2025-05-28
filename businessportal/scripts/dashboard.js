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
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase config
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

// Globals
let currentBusiness = null;
let businessUID = null;
let redemptionLimit = null;
let lastVerifiedCode = null;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const uid = user.uid;
    businessUID = uid;

    const docRef = doc(db, "businessAccounts", uid);
    const businessSnap = await getDoc(docRef);

    if (businessSnap.exists()) {
      const data = businessSnap.data();
      currentBusiness = data.businessName;
      redemptionLimit = data.redemptionLimit;

      document.getElementById("business-info").innerHTML = `
        <p><strong>Business Name:</strong> ${data.businessName}</p>
        <p><strong>Coupon Offer:</strong> ${data.couponOffer}</p>
        <p><strong>Redemption Limit:</strong> ${data.redemptionLimit}</p>
        <p><strong>Reset Interval:</strong> ${data.resetInterval}</p>
      `;
    } else {
      document.getElementById("business-info").innerText = "Business account not found.";
    }
  } else {
    window.location.href = "login.html";
  }
});

// Verify Code
document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionEdit");
  const section = document.getElementById("redemptionSection");
  status.innerText = "";
  history.innerHTML = "";
  section.style.display = "none";

  if (!code) {
    status.innerText = "Please enter a code to verify.";
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists() || !codeSnap.data().isValid) {
    status.innerText = "Code not found or inactive.";
    return;
  }

  const redemptions = codeSnap.data().redemptions || [];
  const used = redemptions.filter(r => r.business === currentBusiness);

  lastVerifiedCode = code;

  if (used.length > 0) {
    status.innerText = "✅ Valid code. Previously redeemed:";
    used.forEach(r => {
      const item = document.createElement("li");
      item.innerText = `${r.date}`;
      history.appendChild(item);
    });
  } else {
    status.innerText = "✅ Valid code. Not yet redeemed at your business.";
  }

  document.getElementById("redeemBtn").disabled = false;

  await loadRedemptions(code); // show edit section
});

// Redeem Code
document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = lastVerifiedCode;
  const status = document.getElementById("redeemStatus");

  if (!code || !currentBusiness) {
    status.innerText = "Missing code or business info.";
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);
  const existing = codeSnap.data().redemptions || [];

  const now = new Date();
  const redemption = {
    business: currentBusiness,
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    status: "Redeemed",
    edited: false,
    notes: "",
    businessName: currentBusiness
  };

  existing.push(redemption);

  await updateDoc(codeRef, { redemptions: existing });

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    ...redemption,
    timestamp: serverTimestamp()
  });

  status.innerText = "✅ Code redeemed successfully!";
  document.getElementById("redeemBtn").disabled = true;

  await loadRedemptions(code);
});

// Load redemption logs
async function loadRedemptions(codeToMatch) {
  const container = document.getElementById("redemptionEdit");
  const section = document.getElementById("redemptionSection");
  container.innerHTML = "";
  section.style.display = "block";

  const q = query(
    collection(db, `businessAccounts/${businessUID}/redemptions`),
    where("code", "==", codeToMatch)
  );

  const snapshot = await getDocs(q);
  snapshot.forEach(docSnap => {
    const data = docSnap.data();

    const div = document.createElement("div");
    div.innerHTML = `
      <p><strong>Date:</strong> ${data.date} <strong>Time:</strong> ${data.time} <strong>Status:</strong> ${data.status}
      <button onclick="deleteRedemption('${docSnap.id}')">[DELETE]</button></p>
      <hr />
    `;
    container.appendChild(div);
  });
}

// Delete redemption entry
window.deleteRedemption = async function (docId) {
  const confirmDelete = confirm("Are you sure you want to delete this redemption?");
  if (!confirmDelete) return;

  const docRef = doc(db, `businessAccounts/${businessUID}/redemptions/${docId}`);
  await deleteDoc(docRef);
  alert("Redemption entry deleted.");
  await loadRedemptions(lastVerifiedCode);
};
