const firebaseConfig = {
  apiKey: "AIzaSyBJxxcGhuYspiZ9HRAlZgihgXLaA2FjPXc",
  authDomain: "coastalcouponverifier.firebaseapp.com",
  projectId: "coastalcouponverifier",
  storageBucket: "coastalcouponverifier.firebasestorage.app",
  messagingSenderId: "189807704712",
  appId: "1:189807704712:web:9427e68464115f388ebd3d"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentBusiness = null;
let businessUID = null;
let redemptionLimit = null;
let resetInterval = null;
let currentCode = null;

auth.onAuthStateChanged(async (user) => {
  if (user) {
    businessUID = user.uid;
    const docRef = db.collection("businessAccounts").doc(businessUID);
    const businessSnap = await docRef.get();
    if (businessSnap.exists) {
      const data = businessSnap.data();
      document.getElementById("business-info").innerHTML = `
        <p><strong>Business Name:</strong> ${data.businessName}</p>
        <p><strong>Coupon Offer:</strong> ${data.couponOffer}</p>
        <p><strong>Redemption Limit:</strong> ${data.redemptionLimit}</p>
        <p><strong>Reset Interval:</strong> ${data.resetInterval}</p>
      `;
      currentBusiness = data.businessName;
      redemptionLimit = data.redemptionLimit;
      resetInterval = data.resetInterval;
    }
  } else {
    window.location.href = "login.html";
  }
});

document.getElementById("verifyBtn").addEventListener("click", async () => {
  const codeInput = document.getElementById("codeInput");
  const code = codeInput.value.trim();
  const status = document.getElementById("redeemStatus");
  const redeemSection = document.getElementById("redeemSection");
  const historyList = document.getElementById("redemptionHistory");
  const historyContainer = document.getElementById("redemptionHistoryContainer");
  const redeemBtn = document.getElementById("redeemBtn");
  const doneBtn = document.getElementById("doneBtn");

  status.innerText = "";
  historyList.innerHTML = "";
  redeemBtn.disabled = true;

  if (!code) {
    status.innerText = "Please enter a code to verify.";
    return;
  }

  const codeDoc = await db.collection("verifiedCodes").doc(code).get();
  if (!codeDoc.exists || !codeDoc.data().isValid) {
    status.innerText = "Invalid or inactive code.";
    return;
  }

  currentCode = code;
  const redemptions = codeDoc.data().redemptions || [];
  const usedByThisBiz = redemptions.filter(r => r.business === currentBusiness);

  if (redemptionLimit !== "unlimited" && usedByThisBiz.length >= parseInt(redemptionLimit)) {
    status.innerText = `Redemption limit reached (${redemptionLimit}).`;
    redeemBtn.disabled = true;
  } else {
    status.innerText = "Code is valid and ready to redeem.";
    redeemBtn.disabled = false;
  }

  if (usedByThisBiz.length > 0) {
    usedByThisBiz.forEach(entry => {
      const item = document.createElement("li");
      item.innerText = `Date: ${new Date(entry.date).toLocaleString()} Status: Redeemed`;
      historyList.appendChild(item);
    });
    historyContainer.style.display = "block";
  }

  redeemSection.style.display = "block";
  doneBtn.style.display = "inline-block";
  document.getElementById("verifyBtn").style.display = "none";
});

document.getElementById("redeemBtn").addEventListener("click", async () => {
  const status = document.getElementById("redeemStatus");
  if (!currentCode || !currentBusiness) {
    status.innerText = "Missing info.";
    return;
  }

  const redemption = {
    business: currentBusiness,
    date: new Date().toISOString(),
    edited: false,
    notes: "",
    businessName: currentBusiness
  };

  const codeRef = db.collection("verifiedCodes").doc(currentCode);
  const codeSnap = await codeRef.get();
  const existingRedemptions = codeSnap.data().redemptions || [];

  await codeRef.update({
    redemptions: [...existingRedemptions, redemption]
  });

  await db.collection("businessAccounts").doc(businessUID)
    .collection("redemptions").add({
      code: currentCode,
      ...redemption,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

  status.innerText = "Code redeemed successfully!";
  document.getElementById("redeemBtn").disabled = true;

  const newItem = document.createElement("li");
  newItem.innerText = `Date: ${new Date().toLocaleString()} Status: Redeemed`;
  document.getElementById("redemptionHistory").appendChild(newItem);
});

document.getElementById("doneBtn").addEventListener("click", () => {
  document.getElementById("codeInput").value = "";
  document.getElementById("redeemStatus").innerText = "";
  document.getElementById("redemptionHistory").innerHTML = "";
  document.getElementById("redeemBtn").disabled = true;
  document.getElementById("redeemSection").style.display = "none";
  document.getElementById("redemptionHistoryContainer").style.display = "none";
  document.getElementById("verifyBtn").style.display = "inline-block";
  document.getElementById("doneBtn").style.display = "none";
});
