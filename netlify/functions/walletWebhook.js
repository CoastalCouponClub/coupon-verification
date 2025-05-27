const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = JSON.parse(process.env.FIREBASE_CLIENT_CONFIG);
const CCC_SECRET = process.env.CCC_WEBHOOK_SECRET;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body); // May throw if it's not valid JSON

    const barcode = body?.['barcode-value'];
    const providedSecret = body?.secret;

    if (!barcode || providedSecret !== CCC_SECRET) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid request' })
      };
    }

    await setDoc(doc(db, 'verifiedCodes', barcode), {
      isValid: true,
      timestamp: serverTimestamp(),
      redemptionCount: 0,
      secret: providedSecret
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Code stored successfully' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
