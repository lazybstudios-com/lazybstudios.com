const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, name, message, type } = req.body || {};

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

    const isBeta = type !== 'demo';

    const subject = isBeta
        ? `Beta Lab Signup — ${email}`
        : `Enterprise Demo Request — ${name || email}`;

    const html = isBeta
        ? `<h2 style="font-family:sans-serif;">New Beta Lab Signup</h2>
           <p style="font-family:sans-serif;">Email: <strong>${email}</strong></p>`
        : `<h2 style="font-family:sans-serif;">Enterprise Demo Request</h2>
           <p style="font-family:sans-serif;"><strong>Name:</strong> ${name || '—'}</p>
           <p style="font-family:sans-serif;"><strong>Email:</strong> ${email}</p>
           <p style="font-family:sans-serif;"><strong>Message:</strong><br>${message || '—'}</p>`;

    try {
        await transporter.sendMail({
            from: `"Lazy B Studios Site" <${process.env.GMAIL_USER}>`,
            to: 'support@lazybstudios.com',
            replyTo: email,
            subject,
            html,
        });
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Mail error:', err.message);
        return res.status(500).json({ error: 'Failed to send. Please email us directly.' });
    }
};
