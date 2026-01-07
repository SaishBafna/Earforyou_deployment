import nodemailer from 'nodemailer';

const sendEmail = async (email, subject, message) => {
    try {
        console.log('Attempting to send email...');
        console.log(`Recipient: ${email}, Subject: ${subject}`);

        // Create transporter with debug and logger options
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            debug: true, // Enable debug output
            logger: true // Enable logging
        });

        console.log('Transporter created, verifying connection...');

        // Verify transporter connection
        await transporter.verify((error, success) => {
            if (error) {
                console.error('Transporter verification failed:', error);
            } else {
                console.log('Server is ready to take our messages');
            }
        });

        let mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: subject,
            text: message,
        };

        console.log('Sending email with options:', mailOptions);

        // Send the email
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending email:');
        console.error('Full error object:', error);

        if (error.responseCode) {
            console.error('SMTP response code:', error.responseCode);
        }
        if (error.response) {
            console.error('SMTP response:', error.response);
        }

        throw new Error(`Failed to send email: ${error.message}`);
    }
};

export default sendEmail;