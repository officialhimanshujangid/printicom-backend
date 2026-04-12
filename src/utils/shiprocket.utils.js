const axios = require('axios');
const SiteSettings = require('../models/SiteSettings.model');

const SHIPROCKET_API = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_VALIDITY_MS = 9 * 24 * 60 * 60 * 1000; // 9 days (tokens last 10 days)

/**
 * Gets or refreshes the cached Shiprocket API token.
 * Caches the token + expiry in the DB to avoid re-authenticating on every call.
 */
const getAuthToken = async () => {
    const settings = await SiteSettings.findOne();
    if (!settings?.shiprocket?.enabled) {
        throw new Error('Shiprocket integration is not enabled in Admin Settings.');
    }

    const { email, password, token, tokenExpiresAt } = settings.shiprocket;
    if (!email || !password) {
        throw new Error('Shiprocket credentials (email/password) are not configured.');
    }

    // Use cached token if still valid
    if (token && tokenExpiresAt && new Date(tokenExpiresAt) > new Date()) {
        return token;
    }

    // Fetch a fresh token
    try {
        const response = await axios.post(`${SHIPROCKET_API}/auth/login`, { email, password }, {
            timeout: 10000
        });

        const newToken = response.data.token;
        if (!newToken) throw new Error('Shiprocket returned empty token.');

        // Cache token in DB with expiry
        const sr = { ...settings.shiprocket.toObject ? settings.shiprocket.toObject() : settings.shiprocket };
        sr.token = newToken;
        sr.tokenExpiresAt = new Date(Date.now() + TOKEN_VALIDITY_MS);
        settings.shiprocket = sr;
        settings.markModified('shiprocket');
        await settings.save();

        return newToken;
    } catch (error) {
        const msg = error.response?.data?.message || error.message;
        console.error('[Shiprocket] Auth Error:', msg);
        throw new Error(`Shiprocket auth failed: ${msg}`);
    }
};

/**
 * Creates an order in Shiprocket and assigns an AWB (Air Waybill) number.
 * Returns { shipmentId, awbCode, courierName, labelUrl }
 */
const createOrderAndAwb = async (orderDoc, orderItems) => {
    const token = await getAuthToken();

    const items = orderItems.map(item => ({
        name: item.productSnapshot?.name || 'Printed Product',
        sku: item.productSnapshot?.slug || `SKU-${Date.now()}`,
        units: item.quantity,
        selling_price: Math.round(item.unitPrice),
        discount: 0,
        tax: item.gstRate || 0,
        hsn: 441122 // Generic HSN code for printed goods
    }));

    const dateStr = new Date(orderDoc.createdAt || Date.now()).toISOString().split('T')[0];

    const payload = {
        order_id: orderDoc.orderNumber,
        order_date: dateStr,
        pickup_location: 'Primary',
        billing_customer_name: orderDoc.shippingAddress?.fullName || 'Customer',
        billing_last_name: '',
        billing_address: orderDoc.shippingAddress?.street || 'Not Provided',
        billing_city: orderDoc.shippingAddress?.city || 'Delhi',
        billing_pincode: orderDoc.shippingAddress?.pincode || '110001',
        billing_state: orderDoc.shippingAddress?.state || 'Delhi',
        billing_country: 'India',
        billing_email: orderDoc.user?.email || 'customer@printicom.in',
        billing_phone: orderDoc.shippingAddress?.phone || '9999999999',
        shipping_is_billing: true,
        order_items: items,
        payment_method: orderDoc.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
        sub_total: Math.round(orderDoc.subtotal || orderDoc.totalAmount),
        length: 20,
        breadth: 20,
        height: 10,
        weight: 0.5
    };

    try {
        // Step 1: Create the order
        const orderRes = await axios.post(`${SHIPROCKET_API}/orders/create/adhoc`, payload, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000
        });

        const srOrder = orderRes.data;
        if (!srOrder?.shipment_id) {
            throw new Error('Shiprocket did not return a shipment_id. Check pickup location setup in Shiprocket dashboard.');
        }

        // Step 2: Assign AWB (courier selection)
        let awbCode = null;
        let courierName = null;
        let labelUrl = null;

        try {
            const awbRes = await axios.post(
                `${SHIPROCKET_API}/courier/assign/awb`,
                { shipment_id: srOrder.shipment_id },
                { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
            );
            const awbData = awbRes.data?.response?.data;
            awbCode = awbData?.awb_code || null;
            courierName = awbData?.courier_name || null;
            labelUrl = awbData?.label_url || null;
        } catch (awbErr) {
            // AWB can fail if serviceability isn't set up — we still have the shipmentId
            console.warn('[Shiprocket] AWB assignment failed (shipment created):', awbErr.response?.data || awbErr.message);
        }

        return {
            shipmentId: String(srOrder.shipment_id),
            awbCode,
            courierName,
            labelUrl,
        };
    } catch (error) {
        const msg = error.response?.data?.message || error.message;
        console.error('[Shiprocket] Create Order Error:', error.response?.data || error.message);
        throw new Error(`Shiprocket order creation failed: ${msg}`);
    }
};

/**
 * Fetches live tracking status for a shipment from Shiprocket.
 * Returns the tracking events array and current status string.
 */
const getTrackingStatus = async (awbCode) => {
    if (!awbCode) throw new Error('AWB code is required for tracking.');
    const token = await getAuthToken();

    try {
        const res = await axios.get(`${SHIPROCKET_API}/courier/track/awb/${awbCode}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
        });

        const trackingData = res.data?.tracking_data;
        if (!trackingData) throw new Error('No tracking data returned from Shiprocket.');

        return {
            currentStatus: trackingData.shipment_status || null,
            etd: trackingData.etd || null,
            shipmentTrack: trackingData.shipment_track || [],
            shipmentActivity: trackingData.shipment_track_activities || [],
        };
    } catch (error) {
        const msg = error.response?.data?.message || error.message;
        console.error('[Shiprocket] Track Error:', msg);
        throw new Error(`Could not fetch tracking: ${msg}`);
    }
};

/**
 * Maps a Shiprocket shipment status string to our internal order status.
 */
const mapShiprocketStatusToOrderStatus = (shiprocketStatus) => {
    if (!shiprocketStatus) return null;
    const s = shiprocketStatus.toLowerCase();

    if (s.includes('delivered')) return 'delivered';
    if (s.includes('out for delivery') || s.includes('ofd')) return 'shipped';
    if (s.includes('in transit') || s.includes('dispatched') || s.includes('picked up')) return 'shipped';
    if (s.includes('cancelled') || s.includes('rto')) return null; // handle manually
    if (s.includes('ready') || s.includes('reached')) return 'shipped';
    return null; // Unknown — don't auto-update
};

module.exports = {
    getAuthToken,
    createOrderAndAwb,
    getTrackingStatus,
    mapShiprocketStatusToOrderStatus,
};
