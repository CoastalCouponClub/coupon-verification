// ... all previous imports and config setup remain unchanged ...

// Redeem code
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

  // Count valid redemptions at this business after update
  const updatedUsed = existing.filter(r => r.business === currentBusiness && !r.deleted);
  const limitReached = redemptionLimit !== "unlimited" && updatedUsed.length >= parseInt(redemptionLimit);

  // Show success message + redemption limit warning if necessary
  status.innerText = "✅ Redemption logged successfully!";
  if (limitReached) {
    status.innerText += ` Redemption limit reached. No further redemptions allowed until reset.`;
  }

  status.style.color = "green";
  status.style.fontWeight = "bold";

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
    const limitNowOk = redemptionLimit !== "unlimited" && remaining.length < parseInt(redemptionLimit);

    if (limitNowOk) {
      document.getElementById("redeemBtn").disabled = false;
      status.innerText = "✅ Code is valid and can be redeemed.";
      status.style.color = "green";
    }
  };

  item.appendChild(delBtn);
  history.appendChild(item);

  document.getElementById("redeemBtn").disabled = true;
});
