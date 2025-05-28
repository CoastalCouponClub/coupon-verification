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
  if (interval === "daily") return addDays(date, 1);
  if (interval === "weekly") return addDays(date, 7);
  if (interval === "monthly") return addMonths(date, 1);
  return null;
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
  const validRedemptions = redemptions
  .filter(r => r.business === currentBusiness && !r.deleted)
  .sort((a, b) => new Date(a.date) - new Date(b.date));


  // Calculate valid redemption window
  let windowStart = null;
  let resetDate = null;

  if (resetInterval !== "none" && validRedemptions.length > 0) {
    const firstDate = new Date(validRedemptions[0].date);
    resetDate = calculateResetDate(firstDate, resetInterval);
    windowStart = new Date(firstDate);
    windowStart.setHours(0, 0, 0, 0);
  }

  const inWindowRedemptions = resetInterval === "none"
    ? validRedemptions
    : validRedemptions.filter(r => {
        const d = new Date(r.date);
        return d >= windowStart && (!resetDate || d < resetDate);
      });

  const limitReached = redemptionLimit !== "unlimited" &&
    inWindowRedemptions.length >= parseInt(redemptionLimit);

 if (limitReached) {
  let message = `Code is valid. Redemption limit reached (${redemptionLimit}).`;

  if (resetInterval !== "none" && validRedemptions.length > 0) {
    const firstRedemption = new Date(validRedemptions[0].date);
    const nextReset = calculateResetDate(firstRedemption, resetInterval);
    if (nextReset) {
      nextReset.setHours(0, 0, 0, 0);
      const formatted = nextReset.toLocaleDateString('en-US', { dateStyle: 'long' });
      message += ` Try again after: ${formatted}`;
    }
  }

  console.log("Final status message:", message);
  status.innerText = message;
  redeemBtn.disabled = true;
  redeemBtn.style.display = "inline-block";
}




  status.innerText = message;
  redeemBtn.disabled = true;
  redeemBtn.style.display = "inline-block";
    console.log("Final status message:", message);
}



  else {
    status.innerText = "✅ Code is valid and can be redeemed.";
    redeemBtn.style.display = "inline-block";
    redeemBtn.disabled = false;
  }

  document.getElementById("verifyBtn").style.display = "none";
  document.getElementById("redemptionHistorySection").style.display = "block";
  doneBtn.style.display = "inline-block";

  validRedemptions.forEach(r => {
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

      // Check if still over limit
      const remaining = updatedRedemptions.filter(x => x.business === currentBusiness && !x.deleted);
      const redemptionsInWindow = resetInterval === "none"
        ? remaining
        : remaining.filter(r => {
            const d = new Date(r.date);
            return d >= windowStart && (!resetDate || d < resetDate);
          });

      if (redemptionsInWindow.length < redemptionLimit) {
        redeemBtn.disabled = false;
        status.innerText = "✅ Code is valid and can be redeemed.";
      }
// Hard delete subcollection entries for cleanliness
const hardDeleteQuery = query(
  collection(db, `businessAccounts/${businessUID}/redemptions`),
  where("code", "==", code)
);
const matchingDocs = await getDocs(hardDeleteQuery);
matchingDocs.forEach(async (d) => {
  await updateDoc(d.ref, { deleted: true });
  if (typeof d.ref.delete === "function") {
    await d.ref.delete(); // Clean up Firestore doc
  }
});

      
    };

    item.appendChild(delBtn);
    history.appendChild(item);
  });
});

document.getElementById("redeemBtn").addEventListener("click", async () => {
  const code = document.getElementById("codeInput").value.trim();
  const status = document.getElementById("redeemStatus");
  const history = document.getElementById("redemptionHistory");

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
  document.getElementById("redeemBtn").disabled = true;

  const item = document.createElement("li");
  item.innerText = `• ${formatDate(redemption.date)} Status: Redeemed`;

  const delBtn = document.createElement("button");
  delBtn.className = "delete-button";
  delBtn.innerText = "Delete";
  delBtn.onclick = async () => {
    redemption.deleted = true;
    const updated = existing.map(entry => entry === redemption ? redemption : entry);
    await updateDoc(codeRef, { redemptions: updated });

    const q = query(collection(db, `businessAccounts/${businessUID}/redemptions`), where("code", "==", code));
    const docs = await getDocs(q);
    docs.forEach(async d => {
      await updateDoc(d.ref, { deleted: true });
    });

    item.remove();
    document.getElementById("redeemBtn").disabled = false;
    status.innerText = "✅ Code is valid and can be redeemed.";
  };

  item.appendChild(delBtn);
  history.appendChild(item);

  // Check if limit now reached
  const valid = existing.filter(x => x.business === currentBusiness && !x.deleted);
  const windowStart = new Date(valid[0]?.date || new Date());
  windowStart.setHours(0, 0, 0, 0);
  const nextReset = calculateResetDate(valid[0]?.date, resetInterval);
  const inWindow = resetInterval === "none"
    ? valid
    : valid.filter(r => {
        const d = new Date(r.date);
        return d >= windowStart && (!nextReset || d < nextReset);
      });

  if (inWindow.length >= redemptionLimit) {
  let message = `\nRedemption limit reached (${redemptionLimit}).`;

  if (resetInterval !== "none" && nextReset) {
    const resetMidnight = new Date(nextReset);
    resetMidnight.setHours(0, 0, 0, 0);
    const resetDateString = resetMidnight.toLocaleDateString('en-US', { dateStyle: 'long' });
    message += ` Try again after: ${resetDateString}`;
  }

  status.innerText += message;
}
// Hard delete subcollection entries for cleanliness
const hardDeleteQuery = query(
  collection(db, `businessAccounts/${businessUID}/redemptions`),
  where("code", "==", code)
);
const matchingDocs = await getDocs(hardDeleteQuery);
matchingDocs.forEach(async (d) => {
  await updateDoc(d.ref, { deleted: true });
  if (typeof d.ref.delete === "function") {
    await d.ref.delete(); // Clean up Firestore doc
  }
});


});

document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemStatus").innerText = "";
  document.getElementById("redeemStatus").style.color = "";
  document.getElementById("redemptionHistory").innerHTML = "";
  document.getElementById("redemptionHistorySection").style.display = "none";

  document.getElementById("verifyBtn").style.display = "inline-block";
  document.getElementById("redeemBtn").style.display = "none";
  document.getElementById("redeemBtn").disabled = true;
  document.getElementById("doneBtn").style.display = "none";
});
