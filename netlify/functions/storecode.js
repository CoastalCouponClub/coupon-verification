const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

// ✅ DECODE your URL-encoded FIREBASE_CLIENT_CONFIG
const firebaseConfig = JSON.parse(decodeURIComponent(process.env.FIREBASE_CLIENT_CONFIG));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

exports.handler = async (event) => {
  try {
    console.log("Received event:", event.body);

    const data = JSON.parse(event.body);
    const barcode = data?.['barcode-text'];
    const secret = data?.secret;

    if (!barcode || secret !== "ccc_hook_91df72fa14") {
      console.log("Invalid input or secret");
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid input or secret' }),
      };
    }

    const codeRef = doc(db, 'verifiedCodes', barcode);

    await setDoc(codeRef, {
      isValid: true,
      timestamp: serverTimestamp(),
      redemptionCount: 0,
      secret: null, // Strip secret from stored doc
    });

    console.log("Successfully stored code:", barcode);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Code stored successfully' }),
    };
  } catch (error) {
    console.error("Error:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
