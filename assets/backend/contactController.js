const transporter = require('./mailer');
const config = require('./config');

const contactController = async (req, res) => {
    const { name, DI, company, message } = req.body; // DI is honeypot

    // 1. Honeypot Check
    if (DI) {
        console.warn(`Spam attempt blocked from IP: ${req.ip}`);
        return res.status(200).json({ success: true, message: 'Message received.' }); // Fake success
    }

    // 2. Validation
    if (!name || !req.body.email || !message) {
        return res.status(400).json({ success: false, error: 'Missing required fields.' });
    }

    const email = req.body.email; // Use correct field name after validation

    // 3. Admin Notification Email
    const adminMailOptions = {
        from: config.emailUser,
        to: config.emailUser,
        subject: `TotyLabs Inquiry: ${company ? company + ' - ' : ''}${name}`,
        text: `New contact submission from TotyLabs website.

Name: ${name}
Email: ${email}
Company: ${company || 'N/A'}

Message:
${message}

---
Sent from: ${req.ip}`
    };

    // 4. User Confirmation Email
    const userMailOptions = {
        from: config.emailUser,
        to: email,
        subject: 'We received your message — TotyLabs',
        text: `Hello ${name},

We have received your inquiry regarding TotyLabs infrastructure.
Our engineering team will review your request and establish a secure channel if applicable.

Reference:
"${message.substring(0, 50)}..."

--
TotyLabs Infrastructure Systems
[STRICT_INFRASTRUCTURE_MODE]`
    };

    try {
        await transporter.sendMail(adminMailOptions);
        await transporter.sendMail(userMailOptions);
        res.status(200).json({ success: true, message: 'Transmission successful.' });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ success: false, error: 'Transmission failed.' });
    }
};

module.exports = { contactController };
