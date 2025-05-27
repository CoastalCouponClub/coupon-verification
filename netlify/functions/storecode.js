exports.handler = async (event) => {
  try {
    const admin = await import('firebase-admin');
    const { getFirestore } = await import('firebase-admin/firestore');

    if (!admin.apps.length) {
      admin.initializeApp();
    }

    const db = getFirestore();
    const data = JSON.parse(event.body);
    const barcode = data?.['barcode-text'];
    const secret = data?.secret;

    if (!barcode || secret !== process.env.CCC_WEBHOOK_SECRET) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing barcode-text or invalid secret' }),
      };
    }

    const now = new Date();
    await db.collection('verifiedCodes').doc(barcode).set({
      isValid: true,
      timestamp: now,
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
