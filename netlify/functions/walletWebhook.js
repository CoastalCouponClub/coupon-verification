
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('../../serviceAccount.json'))
  });
}

const db = admin.firestore();

exports.handler = async (event) => {
  try {
    const data = JSON.parse(event.body);
    const barcode = data?.['barcode-text'];

    if (!barcode) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing barcode-text' })
      };
    }

    const now = new Date();
    await db.collection('verifiedCodes').doc(barcode).set({
      isValid: true,
      timestamp: now,
      redemptionCount: 0
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
