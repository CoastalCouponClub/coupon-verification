const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY); // Store this in Netlify ENV

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

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

    const codeRef = db.collection('verifiedCodes').doc(barcode);

    await codeRef.set({
      isValid: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      redemptionCount: 0,
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
