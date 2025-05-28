firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    const uid = user.uid;
    const businessDoc = await db.collection("businessAccounts").doc(uid).get();

    if (!businessDoc.exists) {
      document.getElementById("business-info").innerText = "Business account not found.";
      return;
    }

    const businessData = businessDoc.data();
    document.getElementById("business-info").innerHTML = `
      <p><strong>Business Name:</strong> ${businessData.businessName}</p>
      <p><strong>Coupon Offer:</strong> ${businessData.couponOffer}</p>
      <p><strong>Redemption Limit:</strong> ${businessData.redemptionLimit}</p>
      <p><strong>Reset Interval:</strong> ${businessData.resetInterval}</p>
    `;

    window.currentBusiness = businessData.businessName;
    window.redemptionLimit = businessData.redemptionLimit;
    window.businessUID = uid;
  } else {
    window.location.href = "login.html";
  }
});

async function redeemCode() {
  const code = document.getElementById("codeInput").value.trim();
  const statusDiv = document.getElementById("redeemStatus");
  statusDiv.innerText = "";

  if (!code || !window.currentBusiness) {
    statusDiv.innerText = "Missing code or business info.";
    return;
  }

  const codeRef = db.collection("verifiedCodes").doc(code);
  const codeDoc = await codeRef.get();

  if (!codeDoc.exists) {
    statusDiv.innerText = "Invalid code.";
    return;
  }

  const codeData = codeDoc.data();
  const redemptions = codeData.redemptions || [];

  const alreadyRedeemed = redemptions.find(r => r.business === window.currentBusiness);
  if (alreadyRedeemed) {
    statusDiv.innerText = `Code already redeemed at ${alreadyRedeemed.business} on ${alreadyRedeemed.date}.`;
    return;
  }

  const newRedemption = {
    business: window.currentBusiness,
    date: new Date().toISOString()
  };

  redemptions.push(newRedemption);
  await codeRef.update({ redemptions });

  statusDiv.innerText = "Code redeemed successfully!";
}
