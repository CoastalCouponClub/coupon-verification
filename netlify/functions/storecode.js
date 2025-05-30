const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = JSON.parse(process.env.FIREBASE_CLIENT_CONFIG);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

exports.handler = async (event) => {
  try {
    const data = JSON.parse(event.body);
    const barcode = data?.['barcode-text'];
    const secret = data?.secret;

    if (!barcode || secret !== "ccc_hook_91df72fa14") {
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
      secret: "ccc_hook_91df72fa14", // ✅ Include secret ONLY for validation
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Code stored successfully' }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
