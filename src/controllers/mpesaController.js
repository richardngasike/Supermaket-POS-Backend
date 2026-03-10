const axios = require('axios');
const pool = require('../utils/db');
const moment = require('moment'); // install with npm i moment

// Generate OAuth token
const getAccessToken = async () => {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const url = process.env.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  const res = await axios.get(url, { headers: { Authorization: `Basic ${auth}` } });
  return res.data.access_token;
};

// Normalize phone number
const formatPhone = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) return '254' + cleaned.slice(1);
  if (cleaned.startsWith('254')) return cleaned;
  if (cleaned.startsWith('7') || cleaned.startsWith('1')) return '254' + cleaned;
  return cleaned;
};

// Initiate STK Push
const initiateSTKPush = async (req, res) => {
  try {
    const { phone, amount, sale_id, account_ref } = req.body;
    if (!phone || !amount) return res.status(400).json({ success: false, message: 'Phone and amount required' });

    const formattedPhone = formatPhone(phone);
    const accessToken = await getAccessToken();

    const shortcode = process.env.MPESA_SHORTCODE || '174379';
    const passkey = process.env.MPESA_PASSKEY;

    // Use moment to generate correct 14-digit timestamp
    const timestamp = moment().format('YYYYMMDDHHmmss');
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    const callbackUrl = process.env.MPESA_CALLBACK_URL; // must be public HTTPS

    const url = process.env.MPESA_ENVIRONMENT === 'production'
      ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
      : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: account_ref || 'SUPERMARKET',
      TransactionDesc: 'Payment for goods',
    };

    const response = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });

    if (response.data.ResponseCode === '0') {
      await pool.query(
        `INSERT INTO mpesa_transactions (checkout_request_id, merchant_request_id, sale_id, phone_number, amount, status)
         VALUES ($1,$2,$3,$4,$5,'pending')
         ON CONFLICT (checkout_request_id) DO UPDATE SET status='pending'`,
        [response.data.CheckoutRequestID, response.data.MerchantRequestID, sale_id || null, formattedPhone, amount]
      );

      return res.json({
        success: true,
        CheckoutRequestID: response.data.CheckoutRequestID,
        CustomerMessage: response.data.CustomerMessage,
        message: `STK push sent to ${formattedPhone}`
      });
    } else {
      return res.status(400).json({ success: false, message: response.data.CustomerMessage || 'STK push failed' });
    }

  } catch (err) {
    console.error('M-Pesa STK error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'M-Pesa request failed. Check credentials and callback URL.' });
  }
};

// M-Pesa Callback
const mpesaCallback = async (req, res) => {
  try {
    const stk = req.body?.Body?.stkCallback;
    if (!stk) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const checkoutRequestID = stk.CheckoutRequestID;
    const resultCode = stk.ResultCode;
    const resultDesc = stk.ResultDesc;
    let mpesaReceiptNumber = null;

    if (resultCode === 0) {
      const items = stk.CallbackMetadata?.Item || [];
      mpesaReceiptNumber = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    }

    const status = resultCode === 0 ? 'completed' : 'failed';

    const txn = await pool.query(
      `UPDATE mpesa_transactions SET status=$1, result_code=$2, result_desc=$3, mpesa_receipt_number=$4, updated_at=NOW()
       WHERE checkout_request_id=$5 RETURNING *`,
      [status, String(resultCode), resultDesc, mpesaReceiptNumber, checkoutRequestID]
    );

    if (resultCode === 0 && txn.rows[0]?.sale_id) {
      await pool.query('UPDATE sales SET mpesa_ref=$1 WHERE id=$2', [mpesaReceiptNumber, txn.rows[0].sale_id]);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('M-Pesa callback error:', err);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
};

// Query STK Push Status
const querySTKStatus = async (req, res) => {
  try {
    const { checkout_request_id } = req.params;
    const result = await pool.query('SELECT * FROM mpesa_transactions WHERE checkout_request_id=$1', [checkout_request_id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({ success: true, transaction: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { initiateSTKPush, mpesaCallback, querySTKStatus };