import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
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

// Auth & setup
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

      loadRedemptions(); // Load history
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
  const history = document.getElementById("redemptionHistory");
  status.innerText = "";
  history.innerHTML = "";

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

  if (used.length > 0) {
    status.innerText = "Code valid, previously redeemed:";
    used.forEach(r => {
      const item = document.createElement("li");
      item.innerText = `${r.date}`;
      history.appendChild(item);
    });
  } else {
    status.innerText = "Code valid and unused at your business.";
  }

  document.getElementById("redeemBtn").disabled = false;
});

// Redeem Code
document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");

  if (!code || !currentBusiness) {
    status.innerText = "Missing code or business info.";
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);
  const existing = codeSnap.data().redemptions || [];

  const newRedemption = {
    business: currentBusiness,
    date: new Date().toISOString(),
    edited: false,
    notes: "",
    businessName: currentBusiness
  };

  existing.push(newRedemption);

  await updateDoc(codeRef, { redemptions: existing });

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    ...newRedemption,
    timestamp: serverTimestamp()
  });

  status.innerText = "Code redeemed successfully!";
  loadRedemptions(); // Refresh history
  document.getElementById("redeemBtn").disabled = true;
});

// Load Redemptions to Edit
async function loadRedemptions() {
  const historyDiv = document.getElementById("redemptionEdit");
  historyDiv.innerHTML = "";

  const snapshot = await getDocs(collection(db, `businessAccounts/${businessUID}/redemptions`));
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const div = document.createElement("div");
    div.innerHTML = `
      <p><strong>Code:</strong> ${data.code}</p>
      <p><strong>Date:</strong> ${data.date}</p>
      <p><strong>Notes:</strong> <input type="text" value="${data.notes}" id="note-${docSnap.id}"/></p>
      <button onclick="updateNote('${docSnap.id}')">Save Note</button>
      <hr />
    `;
    historyDiv.appendChild(div);
  });
}

// Update note function (window-scoped)
window.updateNote = async function (docId) {
  const noteVal = document.getElementById(`note-${docId}`).value;
  const docRef = doc(db, `businessAccounts/${businessUID}/redemptions/${docId}`);
  await updateDoc(docRef, {
    notes: noteVal,
    edited: true
  });
  alert("Note updated.");
};
