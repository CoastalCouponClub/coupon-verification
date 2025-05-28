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

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
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
    } else {
      document.getElementById("business-info").innerText = "Business account not found.";
    }
  } else {
    window.location.href = "login.html";
  }
});

document.getElementById("verifyBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");
  const redeemBtn = document.getElementById("redeemBtn");
  const doneBtn = document.getElementById("doneBtn");

  status.innerText = "";
  history.innerHTML = "";
  redeemBtn.style.display = "none";
  redeemBtn.disabled = false;
  doneBtn.style.display = "none";

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

  const data = codeSnap.data();
  const redemptions = data.redemptions || [];
  const usedAtThisBusiness = redemptions.filter(r => r.business === currentBusiness && !r.deleted);

  const redemptionLimitReached =
    redemptionLimit !== "unlimited" && usedAtThisBusiness.length >= parseInt(redemptionLimit);

  if (redemptionLimitReached) {
    status.innerText = "Code is valid. Redemption limit reached.";
    redeemBtn.disabled = true;
  } else {
    status.innerText = "✅ Code is valid and can be redeemed.";
    redeemBtn.style.display = "inline-block";
    redeemBtn.disabled = false;
  }

  document.getElementById("verifyBtn").style.display = "none";
  document.getElementById("redemptionHistorySection").style.display = "block";
  doneBtn.style.display = "inline-block";

  usedAtThisBusiness.forEach(r => {
    const item = document.createElement("li");
    item.innerText = `• ${formatDate(r.date)} Status: Redeemed`;

    const delBtn = document.createElement("button");
    delBtn.className = "delete-button";
    delBtn.innerText = "Delete";

    delBtn.onclick = async () => {
      r.deleted = true;
      const updatedRedemptions = redemptions.map(entry => entry === r ? r : entry);
      await updateDoc(codeRef, { redemptions: updatedRedemptions });

      const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
      const docs = await getDocs(q);
      docs.forEach(async d => {
        await updateDoc(d.ref, { deleted: true });
      });

      item.remove();

      const remaining = updatedRedemptions.filter(r => r.business === currentBusiness && !r.deleted);
      const limit = redemptionLimit !== "unlimited" && remaining.length >= parseInt(redemptionLimit);

      if (!limit) {
        redeemBtn.disabled = false;
        redeemBtn.style.display = "inline-block";
        status.innerText = "✅ Code is valid and can be redeemed.";
      }
    };

    item.appendChild(delBtn);
    history.appendChild(item);
  });
});

document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");
  const redeemBtn = document.getElementById("redeemBtn");

  if (!code || !currentBusiness) {
    status.innerText = "Missing code or business info.";
    return;
  }

  const codeRef = doc(db, "verifiedCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists()) {
    status.innerText = "Code does not exist.";
    return;
  }

  const redemption = {
    business: currentBusiness,
    date: new Date().toISOString(),
    edited: false,
    notes: "",
    businessName: currentBusiness,
    deleted: false
  };

  const existing = codeSnap.data().redemptions || [];
  existing.push(redemption);

  await updateDoc(codeRef, { redemptions: existing });

  await addDoc(collection(db, `businessAccounts/${businessUID}/redemptions`), {
    code,
    ...redemption,
    timestamp: serverTimestamp()
  });

  status.innerText = "✅ Redemption logged successfully!";

  const item = document.createElement("li");
  item.innerText = `• ${formatDate(redemption.date)} Status: Redeemed`;

  const delBtn = document.createElement("button");
  delBtn.className = "delete-button";
  delBtn.innerText = "Delete";
  delBtn.onclick = async () => {
    redemption.deleted = true;
    const updatedRedemptions = existing.map(entry => entry === redemption ? redemption : entry);
    await updateDoc(codeRef, { redemptions: updatedRedemptions });

    const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
    const docs = await getDocs(q);
    docs.forEach(async d => {
      await updateDoc(d.ref, { deleted: true });
    });

    item.remove();

    const remaining = updatedRedemptions.filter(r => r.business === currentBusiness && !r.deleted);
    const limit = redemptionLimit !== "unlimited" && remaining.length >= parseInt(redemptionLimit);

    if (!limit) {
      redeemBtn.disabled = false;
      redeemBtn.style.display = "inline-block";
      status.innerText = "✅ Code is valid and can be redeemed.";
    }
  };

  item.appendChild(delBtn);
  history.appendChild(item);

  redeemBtn.disabled = true;

  // If redemption limit now met, update message
  const usedAtThisBusiness = existing.filter(r => r.business === currentBusiness && !r.deleted);
  const redemptionLimitReached =
    redemptionLimit !== "unlimited" && usedAtThisBusiness.length >= parseInt(redemptionLimit);
  if (redemptionLimitReached) {
    status.innerText += " Redemption limit reached.";
  }
});

document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemStatus").innerText = "";
  document.getElementById("redeemStatus").style.color = "";
  document.getElementById("redeemStatus").style.fontWeight = "";
  document.getElementById("redemptionHistory").innerHTML = "";
  document.getElementById("redemptionHistorySection").style.display = "none";

  document.getElementById("verifyBtn").style.display = "inline-block";
  document.getElementById("redeemBtn").style.display = "none";
  document.getElementById("redeemBtn").disabled = true;
  document.getElementById("doneBtn").style.display = "none";
});
