const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const { code } = event.queryStringParameters;

  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ valid: false, error: 'Missing code parameter' })
    };
  }

  try {
    const response = await fetch('https://api.walletthat.com/v3/passes', {
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.WALLETTHAT_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'getpassdata',
        'pass-id': code,
        'pass-template-id': process.env.WALLETTHAT_TEMPLATE_ID
      })
    });

    const data = await response.json();

    if (data.status === 'Success') {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: true, data })
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ valid: false, error: data['error-message'] })
      };
    }
  } catch (err) {
    console.error('API error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: 'Internal error' })
    };
  }
};
