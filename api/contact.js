const nodemailer = require('nodemailer');

// Basic in-memory rate limiting (Note: resets on serverless cold starts)
const rateLimitMap = new Map();
const LIMIT = 5; // max 5 requests
const WINDOW = 60 * 60 * 1000; // per 1 hour

function isRateLimited(ip) {
    const now = Date.now();
    const userRecords = rateLimitMap.get(ip) || [];
    const recentRecords = userRecords.filter(timestamp => now - timestamp < WINDOW);
    if (recentRecords.length >= LIMIT) return true;
    recentRecords.push(now);
    rateLimitMap.set(ip, recentRecords);
    return false;
}

function sanitize(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Simple IP-based rate limiting
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (isRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    const { email, name, message, type, app, requestScope, hp_demo, hp_beta, hp_del } = req.body || {};

    // Honeypot check
    if (hp_demo || hp_beta || hp_del) {
        return res.status(200).json({ success: true, note: 'Spam detected' });
    }

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
        },
    });

    let subject, html;
    const sName = sanitize(name);
    const sEmail = sanitize(email);
    const sMessage = sanitize(message);
    const sApp = sanitize(app);
    const sScope = sanitize(requestScope);

    if (type === 'deletion') {
        subject = `⚠️ DATA DELETION REQUEST — ${sEmail}`;
        html = `
            <h2 style="font-family:sans-serif; color:#dc3545;">Data Deletion Request</h2>
            <p style="font-family:sans-serif;"><strong>Name:</strong> ${sName || '—'}</p>
            <p style="font-family:sans-serif;"><strong>Email:</strong> ${sEmail}</p>
            <p style="font-family:sans-serif;"><strong>Application:</strong> ${sApp || '—'}</p>
            <p style="font-family:sans-serif;"><strong>Request Scope:</strong> ${sScope || '—'}</p>
            <p style="font-family:sans-serif;"><strong>Additional Details:</strong><br>${sMessage || '—'}</p>
            <hr>
            <p style="font-family:sans-serif; font-size:0.8rem; color:#666;">
                This request was submitted via the Data Deletion Portal on lazybstudios.com. 
                Please fulfill this request within 30 days to remain compliant with Google Play/Apple policies.
            </p>
        `;
    } else {
        const isBeta = type !== 'demo';
        subject = isBeta
            ? `Beta Lab Signup — ${sEmail}`
            : `Enterprise Demo Request — ${sName || sEmail}`;

        html = isBeta
            ? `<h2 style="font-family:sans-serif;">New Beta Lab Signup</h2>
               <p style="font-family:sans-serif;">Email: <strong>${sEmail}</strong></p>`
            : `<h2 style="font-family:sans-serif;">Enterprise Demo Request</h2>
               <p style="font-family:sans-serif;"><strong>Name:</strong> ${sName || '—'}</p>
               <p style="font-family:sans-serif;"><strong>Email:</strong> ${sEmail}</p>
               <p style="font-family:sans-serif;"><strong>Message:</strong><br>${sMessage || '—'}</p>`;
    }

    try {
        await transporter.sendMail({
            from: `"Lazy B Studios Site" <${process.env.GMAIL_USER}>`,
            to: 'support@lazybstudios.com',
            replyTo: sEmail,
            subject,
            html,
        });
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Mail error:', err.message);
        return res.status(500).json({ error: 'Failed to send. Please email us directly.' });
    }
};
